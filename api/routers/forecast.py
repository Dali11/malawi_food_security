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
    from prophet import Prophet

    df_prophet = df[["date", "avg_price"]].rename(
        columns={"date": "ds", "avg_price": "y"}
    )
    df_prophet["ds"] = pd.to_datetime(df_prophet["ds"])
    df_prophet = df_prophet.dropna().sort_values("ds").reset_index(drop=True)

    # ── Fill gaps with interpolation ──────────────────────────
    # Create complete monthly date range
    full_range = pd.date_range(
        start=df_prophet["ds"].min(),
        end=df_prophet["ds"].max(),
        freq="MS"
    )
    df_full = pd.DataFrame({"ds": full_range})
    df_full = df_full.merge(df_prophet, on="ds", how="left")

    # Linear interpolation for missing months
    df_full["y"] = df_full["y"].interpolate(method="linear")
    df_full["y"] = df_full["y"].clip(lower=50)

    # ── Logistic growth bounds ────────────────────────────────
    last_price      = df_prophet["y"].iloc[-1]
    df_full["cap"]  = last_price * 2.2
    df_full["floor"]= last_price * 0.4

    # ── Prophet model ─────────────────────────────────────────
    date_range_months = (
        (df_full["ds"].max().year - df_full["ds"].min().year) * 12 +
        df_full["ds"].max().month - df_full["ds"].min().month
    )
    has_full_year = date_range_months >= 12

    model = Prophet(
        yearly_seasonality      = has_full_year,
        weekly_seasonality      = False,
        daily_seasonality       = False,
        seasonality_mode        = "additive",
        interval_width          = 0.80,
        changepoint_prior_scale = 0.005,
        seasonality_prior_scale = 1.0,
        growth                  = "logistic",
    )

    model.fit(df_full)

    future          = model.make_future_dataframe(periods=months, freq="MS")
    future["cap"]   = last_price * 2.2
    future["floor"] = last_price * 0.4
    forecast        = model.predict(future)

    last_date       = df_full["ds"].max()
    future_forecast = forecast[forecast["ds"] > last_date][
        ["ds", "yhat", "yhat_lower", "yhat_upper"]
    ].copy()

    # ── Sanity clip ───────────────────────────────────────────
    future_forecast["yhat"]       = future_forecast["yhat"].clip(
        lower=last_price * 0.4, upper=last_price * 2.2)
    future_forecast["yhat_lower"] = future_forecast["yhat_lower"].clip(
        lower=last_price * 0.3, upper=last_price * 2.2)
    future_forecast["yhat_upper"] = future_forecast["yhat_upper"].clip(
        lower=last_price * 0.4, upper=last_price * 2.5)

    # Fix inverted bounds
    mask = future_forecast["yhat_lower"] > future_forecast["yhat_upper"]
    future_forecast.loc[mask, "yhat_lower"] = future_forecast.loc[mask, "yhat"] * 0.85
    future_forecast.loc[mask, "yhat_upper"] = future_forecast.loc[mask, "yhat"] * 1.15

    return future_forecast


def _run_forecast(df: pd.DataFrame, months: int) -> pd.DataFrame:
    """
    Use Prophet if 20+ months available, 
    otherwise use seasonal naive forecast.
    """
    if len(df) >= 20:
        return _run_prophet(df, months)
    else:
        return _run_seasonal_naive(df, months)

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
            WITH monthly AS (
                SELECT
                    DATE_TRUNC('month', date::date)::date AS date,
                    ROUND(AVG(price::numeric), 2)          AS avg_price,
                    COUNT(*)                               AS observations
                FROM prices
                WHERE LOWER(district)  = LOWER($1)
                AND LOWER(commodity) = LOWER($2)
                AND unit = 'KG'
                AND price IS NOT NULL
                AND price::numeric > 50
                GROUP BY DATE_TRUNC('month', date::date)
                HAVING COUNT(*) >= 2
            )
            SELECT * FROM monthly
            WHERE date >= (
                -- Use data from the year where we have at least 6 months coverage
                SELECT DATE_TRUNC('year', month)::date
                FROM (
                    SELECT DATE_TRUNC('month', date::date) AS month
                    FROM monthly
                    GROUP BY DATE_TRUNC('month', date::date)
                ) m
                GROUP BY DATE_TRUNC('year', month)
                HAVING COUNT(*) >= 6
                ORDER BY DATE_TRUNC('year', month) DESC
                LIMIT 1
            )
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

    if not rows or len(rows) < 6:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient recent data to forecast {commodity} in {district_name}. "
                f"Need at least 6 months of consistent data."
        )

    # Build dataframe
    df = pd.DataFrame([dict(r) for r in rows])
    df["avg_price"] = pd.to_numeric(df["avg_price"], errors="coerce")
    df = df.dropna(subset=["avg_price"])

    baseline = float(baseline_row["baseline"]) if baseline_row and baseline_row["baseline"] else df["avg_price"].mean()

    # Run Prophet
    try:
        forecast_df =  _run_prophet(df, months)
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

    method = "Facebook Prophet"
    
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
        "methodology"      : f"{method} · {len(df)} monthly observations · 80% confidence interval",
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