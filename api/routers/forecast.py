"""
routers/forecast.py
Price forecasting endpoint using Facebook Prophet.
GET /api/forecast/{district_name}?commodity=Maize&months=3
"""

from fastapi import APIRouter, HTTPException, Query
from api.database import get_pool
from datetime import datetime
import pandas as pd
import numpy as np
import logging

router = APIRouter(prefix="/api/forecast", tags=["Forecast"])
log    = logging.getLogger(__name__)

FORECASTABLE_COMMODITIES = [
    "Maize", "Maize (new harvest)", "Beans", "Cowpeas",
    "Rice", "Sugar", "Pigeon peas", "Sweet potatoes",
    "Cassava", "Soybeans",
]

# Risk thresholds for alert levels
CRITICAL_MULTIPLIER = 1.6   # 60% above baseline
SEVERE_MULTIPLIER   = 1.4   # 40% above baseline
MODERATE_MULTIPLIER = 1.2   # 20% above baseline


def _risk_level(forecast_price: float, baseline: float) -> str:
    ratio = forecast_price / baseline if baseline > 0 else 1
    if ratio >= CRITICAL_MULTIPLIER: return "Critical"
    if ratio >= SEVERE_MULTIPLIER:   return "Severe"
    if ratio >= MODERATE_MULTIPLIER: return "Moderate"
    return "Normal"


def _season(month: int) -> str:
    if month in [11, 12, 1, 2]: return "Planting season"
    if month in [3, 4, 5]:      return "Harvest season"
    if month in [6, 7, 8]:      return "Post-harvest period"
    return "Lean season"


def _run_prophet(df: pd.DataFrame, months: int) -> pd.DataFrame:
    """Run Prophet forecast. Returns forecast dataframe."""
    from prophet import Prophet

    # Prophet requires columns: ds (date), y (value)
    df_prophet = df[["date", "avg_price"]].rename(
        columns={"date": "ds", "avg_price": "y"}
    )
    df_prophet["ds"] = pd.to_datetime(df_prophet["ds"])
    df_prophet = df_prophet.dropna().sort_values("ds")

    # Add Malawi-specific seasonality
    model = Prophet(
        yearly_seasonality  = True,
        weekly_seasonality  = False,
        daily_seasonality   = False,
        seasonality_mode    = "multiplicative",  # better for food prices
        interval_width      = 0.80,              # 80% confidence interval
        changepoint_prior_scale = 0.05,          # conservative — avoids overfitting
    )

    model.fit(df_prophet)

    # Create future dataframe
    future = model.make_future_dataframe(periods=months, freq="MS")  # Month Start
    forecast = model.predict(future)

    # Return only future months
    last_date = df_prophet["ds"].max()
    future_forecast = forecast[forecast["ds"] > last_date][
        ["ds", "yhat", "yhat_lower", "yhat_upper"]
    ].copy()

    # Clip negative values (prices can't be negative)
    future_forecast["yhat"]       = future_forecast["yhat"].clip(lower=0)
    future_forecast["yhat_lower"] = future_forecast["yhat_lower"].clip(lower=0)
    future_forecast["yhat_upper"] = future_forecast["yhat_upper"].clip(lower=0)

    return future_forecast


@router.get("/{district_name}")
async def forecast_district(
    district_name: str,
    commodity: str = Query(default="Maize", description="Commodity to forecast"),
    months:    int = Query(default=3,       description="Months ahead to forecast", ge=1, le=6),
):
    """
    Generate a 3-month price forecast for a district-commodity pair.
    Uses Facebook Prophet with 6 years of historical WFP price data.
    """

    # Validate district exists
    pool = await get_pool()
    async with pool.acquire() as conn:

        district_check = await conn.fetchrow("""
            SELECT name_1 FROM districts_risk
            WHERE LOWER(name_1) = LOWER($1)
        """, district_name)

        if not district_check:
            raise HTTPException(status_code=404,
                                detail=f"District '{district_name}' not found")

        # Fetch monthly average prices
        rows = await conn.fetch("""
            SELECT
                DATE_TRUNC('month', date::date)::date AS date,
                ROUND(AVG(price::numeric), 2)          AS avg_price,
                COUNT(*)                               AS observations
            FROM prices
            WHERE LOWER(district)  = LOWER($1)
              AND LOWER(commodity) = LOWER($2)
              AND unit = 'KG'
              AND price IS NOT NULL
              AND price::numeric > 0
            GROUP BY DATE_TRUNC('month', date::date)
            ORDER BY date
        """, district_name, commodity)

        # Get baseline (12-month average of most recent data)
        baseline_row = await conn.fetchrow("""
            SELECT ROUND(AVG(price::numeric), 2) AS baseline
            FROM prices
            WHERE LOWER(district)  = LOWER($1)
              AND LOWER(commodity) = LOWER($2)
              AND unit = 'KG'
              AND date::date >= (
                  SELECT MAX(date::date) - INTERVAL '12 months' FROM prices
              )
        """, district_name, commodity)

    if not rows or len(rows) < 12:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient data to forecast {commodity} prices in {district_name}. "
                   f"Need at least 12 months of data, found {len(rows) if rows else 0}."
        )

    # Build dataframe
    df = pd.DataFrame([dict(r) for r in rows])
    df["avg_price"] = pd.to_numeric(df["avg_price"], errors="coerce")
    df = df.dropna(subset=["avg_price"])

    baseline = float(baseline_row["baseline"]) if baseline_row and baseline_row["baseline"] else df["avg_price"].mean()

    # Run Prophet
    try:
        forecast_df = _run_prophet(df, months)
    except Exception as e:
        log.error(f"Prophet failed for {district_name}/{commodity}: {e}")
        raise HTTPException(status_code=500,
                            detail=f"Forecasting failed: {str(e)}")

    # Build response
    forecast_points = []
    for _, row in forecast_df.iterrows():
        month_dt   = pd.Timestamp(row["ds"])
        risk       = _risk_level(row["yhat"], baseline)
        forecast_points.append({
            "month"       : month_dt.strftime("%Y-%m"),
            "month_label" : month_dt.strftime("%B %Y"),
            "season"      : _season(month_dt.month),
            "forecast"    : round(float(row["yhat"]),       0),
            "lower_bound" : round(float(row["yhat_lower"]), 0),
            "upper_bound" : round(float(row["yhat_upper"]), 0),
            "risk_level"  : risk,
            "pct_vs_baseline": round(
                (float(row["yhat"]) - baseline) / baseline * 100, 1
            ) if baseline > 0 else 0,
        })

    # Overall alert level (worst case across forecast period)
    risk_order  = {"Critical": 3, "Severe": 2, "Moderate": 1, "Normal": 0}
    worst_risk  = max(forecast_points, key=lambda x: risk_order[x["risk_level"]])
    alert_level = worst_risk["risk_level"]

    # Trend direction
    if len(forecast_points) >= 2:
        first_price = forecast_points[0]["forecast"]
        last_price  = forecast_points[-1]["forecast"]
        trend = "rising" if last_price > first_price * 1.05 else \
                "falling" if last_price < first_price * 0.95 else "stable"
    else:
        trend = "stable"

    # Summary insight for NGO analysts
    def _insight(alert: str, trend: str, commodity: str, months: int) -> str:
        period = f"next {months} month{'s' if months > 1 else ''}"
        if alert == "Critical":
            return (
                f"{commodity} prices are forecast to reach critical levels over the {period}. "
                f"Immediate pre-positioning of food assistance is recommended."
            )
        if alert == "Severe":
            return (
                f"{commodity} prices are forecast to reach severe levels over the {period}. "
                f"Prepare emergency response and monitor markets closely."
            )
        if alert == "Moderate":
            return (
                f"{commodity} prices are forecast to remain elevated over the {period}. "
                f"Close monitoring and early warning communications are advised."
            )
        if trend == "rising":
            return (
                f"{commodity} prices are forecast to rise gradually over the {period} "
                f"but remain within normal ranges. Continue routine monitoring."
            )
        if trend == "falling":
            return (
                f"{commodity} prices are forecast to ease over the {period}, "
                f"suggesting improving food access conditions."
            )
        return (
            f"{commodity} prices are forecast to remain stable over the {period}. "
            f"No immediate intervention required."
        )

    return {
        "district"         : district_check["name_1"],
        "commodity"        : commodity,
        "generated_at"     : datetime.now().strftime("%d %B %Y %H:%M"),
        "data_points_used" : len(df),
        "baseline_price"   : round(baseline, 0),
        "alert_level"      : alert_level,
        "trend"            : trend,
        "insight"          : _insight(alert_level, trend, commodity, months),
        "forecast"         : forecast_points,
        "methodology"      : (
            "Facebook Prophet time series model with multiplicative seasonality. "
            "80% confidence interval. Trained on WFP VAM monthly price data "
            "January 2020 – April 2026."
        ),
    }


@router.get("/")
async def list_forecastable(district_name: str = Query(...)):
    """List commodities with enough data to forecast for a district."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                commodity,
                COUNT(*) AS months,
                ROUND(AVG(price::numeric), 0) AS avg_price
            FROM prices
            WHERE LOWER(district) = LOWER($1)
              AND unit = 'KG'
              AND price IS NOT NULL
            GROUP BY commodity
            HAVING COUNT(*) >= 12
            ORDER BY months DESC
        """, district_name)

    return {
        "district"    : district_name,
        "commodities" : [dict(r) for r in rows],
    }