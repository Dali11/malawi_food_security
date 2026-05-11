"""
update_pipeline.py
Phase 9 — Automatic Data Update Pipeline
"""

import pandas as pd
import numpy as np
import psycopg2
import psycopg2.extras
import requests
import os
import sys
import logging
from datetime import datetime
from io import StringIO
from dotenv import load_dotenv

load_dotenv()

log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f'pipeline_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger(__name__)

WFP_URL = (
    "https://data.humdata.org/dataset/"
    "75ecb747-717e-4ce5-b7af-0e13cc95ba63/resource/"
    "da3ed5da-d6ad-4a86-b4bc-b77e74d01ab7/download/"
    "wfp_food_prices_mwi.csv"
)

DB_CONFIG = {
    "host"    : os.getenv("DB_HOST",     "localhost"),
    "port"    : int(os.getenv("DB_PORT", "5432")),
    "dbname"  : os.getenv("DB_NAME",     "malawi_food_security"),
    "user"    : os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", "malawi123"),
}

FOOD_CATEGORIES = [
    'cereals and tubers',
    'pulses and nuts',
    'meat, fish and eggs',
    'miscellaneous food',
    'oil and fats',
    'vegetables and fruits'
]

def download_wfp_data() -> pd.DataFrame:
    log.info("Downloading latest WFP data from HDX...")
    response = requests.get(WFP_URL, timeout=120)
    response.raise_for_status()
    df = pd.read_csv(StringIO(response.text))
    log.info(f"Downloaded {len(df):,} total records")
    return df

def get_existing_dates(conn) -> set:
    log.info("Fetching existing dates from database...")
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT date FROM prices")
        dates = {str(row[0]) for row in cur.fetchall()}
    log.info(f"Found {len(dates)} existing date records in database")
    return dates

def clean_new_data(df_raw: pd.DataFrame, existing_dates: set) -> pd.DataFrame:
    log.info("Cleaning and filtering new data...")
    df = df_raw.copy()

    # Parse dates
    df['date'] = pd.to_datetime(df['date'])

    # ── CRITICAL: Keep only 2020 onwards ──────────────────────────────────
    df = df[df['date'] >= '2020-01-01']

    # Filter food categories
    df = df[df['category'].isin(FOOD_CATEGORIES)]

    # Remove national average
    df = df[df['market'] != 'National Average']

    # Drop nulls
    df = df.dropna(subset=['admin2', 'price'])

    # Rename
    df = df.rename(columns={'admin1': 'region', 'admin2': 'district'})

    # Split standardised vs informal
    df_standard = df[df['unit'].isin(['KG', 'L'])].copy()
    df_informal  = df[df['unit'].isin(['Heap', 'Bunch', 'Unit'])].copy()

    # Find new rows only
    df_standard['date_str'] = df_standard['date'].astype(str)
    new_standard = df_standard[~df_standard['date_str'].isin(existing_dates)]

    log.info(f"Standardised records in download : {len(df_standard):,}")
    log.info(f"New standardised records         : {len(new_standard):,}")
    log.info(f"Informal records (not loaded)    : {len(df_informal):,}")

    if len(new_standard) == 0:
        log.info("No new data found — database is up to date")
        return pd.DataFrame()

    new_standard = new_standard.sort_values(
        ['district', 'market', 'commodity', 'date']
    ).reset_index(drop=True)

    return new_standard

def load_historical_data(conn) -> pd.DataFrame:
    log.info("Loading historical data for spike detection context...")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT date, district, market, commodity,
                   price, unit, region, is_spike, spike_severity
            FROM prices
            ORDER BY district, market, commodity, date
        """)
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
    df = pd.DataFrame(rows, columns=cols)
    df['date']  = pd.to_datetime(df['date'])
    df['price'] = pd.to_numeric(df['price'], errors='coerce')
    log.info(f"Loaded {len(df):,} historical records")
    return df

def detect_spikes(df_new: pd.DataFrame, df_history: pd.DataFrame) -> pd.DataFrame:
    log.info("Running spike detection on new data...")

    # Ensure numeric types
    df_history['price'] = pd.to_numeric(df_history['price'], errors='coerce')
    df_new['price']     = pd.to_numeric(df_new['price'],     errors='coerce')
    df_history = df_history.dropna(subset=['price'])
    df_new     = df_new.dropna(subset=['price'])

    df_combined = pd.concat([df_history, df_new], ignore_index=True)
    df_combined = df_combined.sort_values(
        ['district', 'market', 'commodity', 'date']
    ).reset_index(drop=True)

    GROUP_KEY = ['district', 'market', 'commodity']

    df_combined['pct_change'] = (
        df_combined.groupby(GROUP_KEY)['price'].pct_change() * 100
    )

    def rolling_zscore(series, window=12):
        roll = series.rolling(window, min_periods=3)
        return (series - roll.mean()) / roll.std()

    df_combined['zscore'] = (
        df_combined.groupby(GROUP_KEY)['price'].transform(rolling_zscore)
    )

    df_combined['is_spike'] = (
        (df_combined['pct_change'] >= 20) &
        (df_combined['zscore']    >= 1.5)
    )

    conditions = [
        (df_combined['pct_change'] >= 60) & (df_combined['zscore'] >= 2.5),
        (df_combined['pct_change'] >= 40) & (df_combined['zscore'] >= 2.0),
        (df_combined['pct_change'] >= 20) & (df_combined['zscore'] >= 1.5),
    ]
    choices = ['Critical', 'Severe', 'Moderate']
    df_combined['spike_severity'] = np.select(
        conditions, choices, default='Normal'
    )

    new_dates  = set(df_new['date'].astype(str).unique())
    df_result  = df_combined[df_combined['date'].astype(str).isin(new_dates)].copy()
    new_spikes = df_result[df_result['spike_severity'] != 'Normal']
    critical   = df_result[df_result['spike_severity'] == 'Critical']

    log.info(f"New records processed    : {len(df_result):,}")
    log.info(f"New spike events         : {len(new_spikes):,}")
    log.info(f"New critical events      : {len(critical):,}")

    return df_result

def insert_new_data(conn, df_new: pd.DataFrame) -> int:
    if len(df_new) == 0:
        return 0

    log.info(f"Inserting {len(df_new):,} new records into database...")

    columns = [
        'date', 'region', 'district', 'market',
        'latitude', 'longitude', 'category', 'commodity',
        'unit', 'price', 'usdprice', 'pct_change',
        'zscore', 'is_spike', 'spike_severity'
    ]

    for col in columns:
        if col not in df_new.columns:
            df_new[col] = None

    df_new = df_new.copy()
    df_new['date']     = df_new['date'].astype(str)
    df_new['is_spike'] = df_new['is_spike'].astype(str)
    df_new = df_new.replace({np.nan: None})

    records = df_new[columns].values.tolist()

    insert_sql = f"""
        INSERT INTO prices ({', '.join(columns)})
        VALUES %s
        ON CONFLICT DO NOTHING
    """

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, insert_sql, records, page_size=1000)
        conn.commit()

    log.info(f"Inserted {len(records):,} records successfully")
    return len(records)

def update_spikes_table(conn, df_new: pd.DataFrame) -> None:
    new_spikes = df_new[
        (df_new['spike_severity'] != 'Normal') &
        (df_new['latitude'].notna()) &
        (df_new['longitude'].notna())
    ].copy()

    if len(new_spikes) == 0:
        log.info("No new spike events to add to spikes table")
        return

    log.info(f"Adding {len(new_spikes):,} new spike events to spikes table...")

    # Ensure correct types
    new_spikes['date']       = pd.to_datetime(new_spikes['date']).dt.date
    new_spikes['price']      = pd.to_numeric(new_spikes['price'],      errors='coerce')
    new_spikes['pct_change'] = pd.to_numeric(new_spikes['pct_change'], errors='coerce')
    new_spikes['zscore']     = pd.to_numeric(new_spikes['zscore'],     errors='coerce')
    new_spikes['latitude']   = pd.to_numeric(new_spikes['latitude'],   errors='coerce')
    new_spikes['longitude']  = pd.to_numeric(new_spikes['longitude'],  errors='coerce')
    new_spikes = new_spikes.dropna(subset=['price', 'latitude', 'longitude'])

    inserted = 0
    with conn.cursor() as cur:
        for _, row in new_spikes.iterrows():
            try:
                cur.execute("""
                    INSERT INTO spikes (
                        date, region, district, market,
                        commodity, price, pct_change, zscore,
                        spike_severity, wkb_geometry
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    )
                    ON CONFLICT DO NOTHING
                """, (
                    row['date'],
                    row.get('region'),
                    row['district'],
                    row['market'],
                    row['commodity'],
                    float(row['price']),
                    float(row['pct_change']) if pd.notna(row['pct_change']) else None,
                    float(row['zscore'])     if pd.notna(row['zscore'])     else None,
                    row['spike_severity'],
                    float(row['longitude']),
                    float(row['latitude']),
                ))
                inserted += 1
            except Exception as e:
                log.warning(f"Skipped spike row: {e}")
                conn.rollback()
                continue

        conn.commit()

    log.info(f"Added {inserted:,} new spike events")

def rebuild_district_risk(conn) -> None:
    log.info("Rebuilding district risk scores...")
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE districts_risk dr
            SET
                critical_count = sub.critical_count,
                severe_count   = sub.severe_count,
                moderate_count = sub.moderate_count,
                total_spikes   = sub.total_spikes,
                total_records  = sub.total_records,
                spike_rate_pct = ROUND((sub.total_spikes::numeric / NULLIF(sub.total_records, 0)) * 100, 2),
                risk_score     = (sub.critical_count * 3) + (sub.severe_count * 2) + sub.moderate_count,
                avg_price      = sub.avg_price
            FROM (
                SELECT
                    district,
                    COUNT(*)                                                          AS total_records,
                    SUM(CASE WHEN is_spike = 'true'        THEN 1 ELSE 0 END)        AS total_spikes,
                    SUM(CASE WHEN spike_severity='Critical' THEN 1 ELSE 0 END)       AS critical_count,
                    SUM(CASE WHEN spike_severity='Severe'   THEN 1 ELSE 0 END)       AS severe_count,
                    SUM(CASE WHEN spike_severity='Moderate' THEN 1 ELSE 0 END)       AS moderate_count,
                    ROUND(AVG(price::numeric)::numeric, 0)                            AS avg_price
                FROM prices
                GROUP BY district
            ) sub
            WHERE LOWER(dr.name_1) = LOWER(sub.district)
        """)
        conn.commit()
    log.info("District risk scores rebuilt successfully")

def log_pipeline_run(conn, stats: dict) -> None:
    conn.rollback()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pipeline_log (
                id           SERIAL PRIMARY KEY,
                run_at       TIMESTAMP DEFAULT NOW(),
                new_records  INTEGER,
                new_spikes   INTEGER,
                new_critical INTEGER,
                latest_date  TEXT,
                status       TEXT,
                notes        TEXT
            )
        """)
        cur.execute("""
            INSERT INTO pipeline_log
                (new_records, new_spikes, new_critical, latest_date, status, notes)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            stats.get('new_records',  0),
            stats.get('new_spikes',   0),
            stats.get('new_critical', 0),
            stats.get('latest_date',  ''),
            stats.get('status',       'success'),
            stats.get('notes',        '')
        ))
        conn.commit()
    log.info("Pipeline run logged to database")

def run_pipeline():
    log.info("=" * 60)
    log.info("MALAWI FOOD SECURITY — DATA UPDATE PIPELINE")
    log.info(f"Run started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 60)

    stats = {
        'new_records' : 0,
        'new_spikes'  : 0,
        'new_critical': 0,
        'latest_date' : '',
        'status'      : 'success',
        'notes'       : ''
    }

    conn = None
    try:
        log.info("Connecting to database...")
        conn = psycopg2.connect(**DB_CONFIG)
        log.info("Connected successfully")

        df_raw         = download_wfp_data()
        existing_dates = get_existing_dates(conn)
        df_new         = clean_new_data(df_raw, existing_dates)

        if len(df_new) == 0:
            stats['status'] = 'success'
            stats['notes']  = 'No new data available'
            log_pipeline_run(conn, stats)
            return stats

        df_history   = load_historical_data(conn)
        df_processed = detect_spikes(df_new, df_history)
        inserted     = insert_new_data(conn, df_processed)

        update_spikes_table(conn, df_processed)
        rebuild_district_risk(conn)

        new_spikes   = df_processed[df_processed['spike_severity'] != 'Normal']
        new_critical = df_processed[df_processed['spike_severity'] == 'Critical']

        stats['new_records']  = inserted
        stats['new_spikes']   = len(new_spikes)
        stats['new_critical'] = len(new_critical)
        stats['latest_date']  = str(df_processed['date'].max())
        stats['status']       = 'success'

        log_pipeline_run(conn, stats)

        log.info("=" * 60)
        log.info("PIPELINE COMPLETE")
        log.info(f"  New records inserted : {stats['new_records']:,}")
        log.info(f"  New spike events     : {stats['new_spikes']:,}")
        log.info(f"  New critical events  : {stats['new_critical']:,}")
        log.info(f"  Latest data date     : {stats['latest_date']}")
        log.info("=" * 60)

        return stats

    except Exception as e:
        log.error(f"Pipeline failed: {e}", exc_info=True)
        stats['status'] = 'failed'
        stats['notes']  = str(e)
        if conn:
            log_pipeline_run(conn, stats)
        raise

    finally:
        if conn:
            conn.close()
            log.info("Database connection closed")

if __name__ == "__main__":
    run_pipeline()