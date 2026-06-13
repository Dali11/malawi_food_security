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
    "host"    : os.getenv("DB_HOST",     "aws-0-eu-west-1.pooler.supabase.com"),
    "port"    : int(os.getenv("DB_PORT", "5432")),
    "dbname"  : os.getenv("DB_NAME",     "postgres"),
    "user"    : os.getenv("DB_USER",     "postgres.dnqtmkkuqrkcyavysobm"),
    "password": os.getenv("DB_PASSWORD", "dalitsokamphani"),
}

FOOD_CATEGORIES = [
    'cereals and tubers',
    'pulses and nuts',
    'meat, fish and eggs',
    'miscellaneous food',
    'oil and fats',
    'vegetables and fruits'
]

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Download
# ─────────────────────────────────────────────────────────────────────────────

def download_wfp_data() -> pd.DataFrame:
    log.info("Downloading latest WFP data from HDX...")
    response = requests.get(WFP_URL, timeout=120)
    response.raise_for_status()
    df = pd.read_csv(StringIO(response.text))
    log.info(f"Downloaded {len(df):,} total records")
    return df

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Fetch existing keys (composite fingerprint per row)
# ─────────────────────────────────────────────────────────────────────────────

def get_existing_keys(conn) -> set:
    """
    Returns a set of (date_str, district, market, commodity, unit) tuples
    already in the database. This replaces the old date-only check so we
    catch WFP corrections to existing rows as well as genuinely new rows.
    """
    log.info("Fetching existing row keys from database...")
    with conn.cursor() as cur:
        cur.execute("""
                    SELECT date::text, district, market, commodity, unit
                    FROM prices
                    """)
        keys = {(str(r[0]), r[1], r[2], r[3], r[4]) for r in cur.fetchall()}
    log.info(f"Found {len(keys):,} existing row keys in database")
    return keys


def get_existing_informal_keys(conn) -> set:
    """
    Returns existing composite keys from prices_informal table.
    Prevents re-inserting records already processed.
    """
    log.info("Fetching existing informal row keys from database...")
    with conn.cursor() as cur:
        cur.execute("""
                    SELECT date::text, district, market, commodity, unit
                    FROM prices_informal
                    """)
        keys = {(str(r[0]), r[1], r[2], r[3], r[4]) for r in cur.fetchall()}
    log.info(f"Found {len(keys):,} existing informal row keys in database")
    return keys

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Clean & split: new rows vs already-known rows
# ─────────────────────────────────────────────────────────────────────────────

def clean_new_data(df_raw: pd.DataFrame, existing_keys: set):
    """
    Returns (new_rows, df_standard, df_informal).

    new_rows    — standardised rows whose composite key is not in the DB.
    df_standard — full cleaned standardised dataframe (KG + L units).
    df_informal — full cleaned informal dataframe (Heap, Bunch, Unit).
    """
    log.info("Cleaning and filtering new data...")
    df = df_raw.copy()

    # Parse & filter dates
    df['date'] = pd.to_datetime(df['date'])
    df = df[df['date'] >= '2020-01-01']

    # Filter food categories and remove national average
    df = df[df['category'].isin(FOOD_CATEGORIES)]
    df = df[df['market'] != 'National Average']

    # Drop nulls
    df = df.dropna(subset=['admin2', 'price'])

    # Rename columns
    df = df.rename(columns={'admin1': 'region', 'admin2': 'district'})

    # Split standardised vs informal
    df_standard = df[df['unit'].isin(['KG', 'L'])].copy()
    df_informal  = df[df['unit'].isin(['Heap', 'Bunch', 'Unit'])].copy()

    # Build composite key for each standardised row
    df_standard['_row_key'] = list(zip(
        df_standard['date'].astype(str),
        df_standard['district'],
        df_standard['market'],
        df_standard['commodity'],
        df_standard['unit']
    ))

    # New rows = composite key not yet in DB
    new_rows = df_standard[~df_standard['_row_key'].isin(existing_keys)].copy()

    log.info(f"Standardised records in download : {len(df_standard):,}")
    log.info(f"New records (unseen keys)        : {len(new_rows):,}")
    log.info(f"Informal records found           : {len(df_informal):,}")

    if len(new_rows) == 0:
        log.info("No new rows — will check for price revisions on existing rows...")
        return pd.DataFrame(), df_standard, df_informal

    return (
        new_rows.sort_values(['district', 'market', 'commodity', 'date'])
        .reset_index(drop=True),
        df_standard,
        df_informal
    )

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Detect price revisions on rows already in the DB
# ─────────────────────────────────────────────────────────────────────────────

def detect_revisions(conn, df_standard: pd.DataFrame) -> pd.DataFrame:
    """
    Compares every standardised row in the fresh CSV against the price
    stored in the DB for the same composite key. Returns rows where
    WFP has silently corrected the price (difference > 0.01 MWK).
    """
    log.info("Checking for price revisions on existing rows...")

    with conn.cursor() as cur:
        cur.execute("""
                    SELECT date::text, district, market, commodity, unit, price
                    FROM prices
                    """)
        db_prices = {
            (str(r[0]), r[1], r[2], r[3], r[4]): float(r[5])
            for r in cur.fetchall()
            if r[5] is not None
        }

    revisions = []
    for _, row in df_standard.iterrows():
        key = (
            str(row['date'].date()),
            row['district'],
            row['market'],
            row['commodity'],
            row['unit']
        )
        db_price = db_prices.get(key)
        if db_price is not None and abs(float(row['price']) - db_price) > 0.01:
            revisions.append(row)
            log.info(
                f"  Revision detected: {key} | "
                f"DB={db_price:.2f} → WFP={float(row['price']):.2f}"
            )

    if revisions:
        log.info(f"Found {len(revisions):,} price revision(s)")
        return pd.DataFrame(revisions).reset_index(drop=True)

    log.info("No price revisions found — database is truly up to date")
    return pd.DataFrame()

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Load historical data for spike context
# ─────────────────────────────────────────────────────────────────────────────

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

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Spike detection
# ─────────────────────────────────────────────────────────────────────────────

def detect_spikes(df_new: pd.DataFrame, df_history: pd.DataFrame) -> pd.DataFrame:
    log.info("Running spike detection on new data...")

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

    new_dates = set(df_new['date'].astype(str).unique())
    df_result = df_combined[df_combined['date'].astype(str).isin(new_dates)].copy()

    new_spikes = df_result[df_result['spike_severity'] != 'Normal']
    critical   = df_result[df_result['spike_severity'] == 'Critical']

    log.info(f"New records processed : {len(df_result):,}")
    log.info(f"New spike events      : {len(new_spikes):,}")
    log.info(f"New critical events   : {len(critical):,}")

    return df_result

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Upsert into prices table
# ─────────────────────────────────────────────────────────────────────────────

def insert_new_data(conn, df_new: pd.DataFrame) -> int:
    if len(df_new) == 0:
        return 0

    log.info(f"Upserting {len(df_new):,} records into prices table...")

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
    df_new['is_spike'] = df_new['is_spike'].astype(bool)
    df_new = df_new.replace({np.nan: None})

    records = df_new[columns].values.tolist()

    insert_sql = f"""
        INSERT INTO prices ({', '.join(columns)})
        VALUES %s
        ON CONFLICT (date, district, market, commodity, unit)
        DO UPDATE SET
            price          = EXCLUDED.price,
            usdprice       = EXCLUDED.usdprice,
            pct_change     = EXCLUDED.pct_change,
            zscore         = EXCLUDED.zscore,
            is_spike       = EXCLUDED.is_spike,
            spike_severity = EXCLUDED.spike_severity
    """

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, insert_sql, records, page_size=1000)
        conn.commit()

    log.info(f"Upserted {len(records):,} records successfully")
    return len(records)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8 — Update spikes table
# ─────────────────────────────────────────────────────────────────────────────

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

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8b — Process and upsert informal prices
# ─────────────────────────────────────────────────────────────────────────────

def load_informal_history(conn) -> pd.DataFrame:
    """Load all existing informal prices for zscore context."""
    with conn.cursor() as cur:
        cur.execute("""
                    SELECT date, district, market, commodity, unit,
                        price, region, is_spike, spike_severity
                    FROM prices_informal
                    ORDER BY district, market, commodity, date
                    """)
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
    df = pd.DataFrame(rows, columns=cols)
    df['date']  = pd.to_datetime(df['date'])
    df['price'] = pd.to_numeric(df['price'], errors='coerce')
    return df


def process_informal_data(conn, df_informal: pd.DataFrame, existing_informal_keys: set) -> int:
    """
    Runs spike detection on informal price data (Heap/Bunch/Unit units)
    and upserts into the prices_informal table.
    Loads full history first so rolling zscore has proper context.
    """
    if len(df_informal) == 0:
        log.info("No informal records to process")
        return 0

    # Filter to only new rows
    df_informal['_row_key'] = list(zip(
        df_informal['date'].astype(str),
        df_informal['district'],
        df_informal['market'],
        df_informal['commodity'],
        df_informal['unit']
    ))
    df_new = df_informal[~df_informal['_row_key'].isin(existing_informal_keys)].copy()

    if len(df_new) == 0:
        log.info("No new informal records — already up to date")
        return 0

    log.info(f"Processing {len(df_new):,} new informal records...")

    df_new['date']  = pd.to_datetime(df_new['date'])
    df_new['price'] = pd.to_numeric(df_new['price'], errors='coerce')
    df_new = df_new.dropna(subset=['price'])

    # Load full history for proper zscore context
    df_history = load_informal_history(conn)

    GROUP_KEY = ['district', 'market', 'commodity']

    # Combine history + new rows so rolling window has full context
    if len(df_history) > 0:
        df_combined = pd.concat([df_history, df_new], ignore_index=True)
    else:
        df_combined = df_new.copy()

    df_combined = df_combined.sort_values(GROUP_KEY + ['date']).reset_index(drop=True)
    df_combined['pct_change'] = df_combined.groupby(GROUP_KEY)['price'].pct_change() * 100

    def rolling_zscore(series, window=12):
        roll = series.rolling(window, min_periods=3)
        return (series - roll.mean()) / roll.std()

    df_combined['zscore'] = df_combined.groupby(GROUP_KEY)['price'].transform(rolling_zscore)

    conditions = [
        (df_combined['pct_change'] >= 60) & (df_combined['zscore'] >= 2.5),
        (df_combined['pct_change'] >= 40) & (df_combined['zscore'] >= 2.0),
        (df_combined['pct_change'] >= 20) & (df_combined['zscore'] >= 1.5),
        ]
    choices = ['Critical', 'Severe', 'Moderate']
    df_combined['spike_severity'] = np.select(conditions, choices, default='Normal')
    df_combined['is_spike']       = df_combined['spike_severity'] != 'Normal'

    # Slice back to only the new rows (now with corrected spike values)
    new_dates = set(df_new['date'].astype(str).unique())
    df_new = df_combined[df_combined['date'].astype(str).isin(new_dates)].copy()

    columns = [
        'date', 'region', 'district', 'market', 'market_id',
        'latitude', 'longitude', 'category', 'commodity', 'commodity_id',
        'unit', 'priceflag', 'pricetype', 'currency',
        'price', 'usdprice', 'pct_change', 'zscore', 'is_spike', 'spike_severity'
    ]
    for col in columns:
        if col not in df_new.columns:
            df_new[col] = None

    df_new = df_new.copy()
    df_new['date']     = df_new['date'].astype(str)
    df_new['is_spike'] = df_new['is_spike'].astype(bool)
    df_new = df_new.replace({np.nan: None})

    records = df_new[columns].values.tolist()

    insert_sql = f"""
        INSERT INTO prices_informal ({', '.join(columns)})
        VALUES %s
        ON CONFLICT (date, district, market, commodity, unit)
        DO UPDATE SET
            price          = EXCLUDED.price,
            usdprice       = EXCLUDED.usdprice,
            pct_change     = EXCLUDED.pct_change,
            zscore         = EXCLUDED.zscore,
            is_spike       = EXCLUDED.is_spike,
            spike_severity = EXCLUDED.spike_severity
    """

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, insert_sql, records, page_size=1000)
        conn.commit()

    new_informal_spikes = df_new[df_new['spike_severity'] != 'Normal']
    log.info(f"Upserted {len(records):,} informal records")
    log.info(f"Informal spike events detected: {len(new_informal_spikes):,}")

    return len(records)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9 — Rebuild district risk scores
# ─────────────────────────────────────────────────────────────────────────────

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
                    COUNT(*)                                                     AS total_records,
                    SUM(CASE WHEN is_spike = 'true'          THEN 1 ELSE 0 END) AS total_spikes,
                    SUM(CASE WHEN spike_severity = 'Critical' THEN 1 ELSE 0 END) AS critical_count,
                    SUM(CASE WHEN spike_severity = 'Severe'   THEN 1 ELSE 0 END) AS severe_count,
                    SUM(CASE WHEN spike_severity = 'Moderate' THEN 1 ELSE 0 END) AS moderate_count,
                    ROUND(AVG(price::numeric)::numeric, 0)                       AS avg_price
                FROM prices
                GROUP BY district
            ) sub
                    WHERE LOWER(dr.name_1) = LOWER(sub.district)
                    """)
        conn.commit()
    log.info("District risk scores rebuilt successfully")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 10 — Log pipeline run
# ─────────────────────────────────────────────────────────────────────────────

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
                        new_informal INTEGER,
                        latest_date  TEXT,
                        status       TEXT,
                        notes        TEXT
                        )
                    """)
        # Add column if it doesn't exist yet (handles existing tables)
        cur.execute("""
                    ALTER TABLE pipeline_log
                        ADD COLUMN IF NOT EXISTS new_informal INTEGER
                    """)
        cur.execute("""
                    INSERT INTO pipeline_log
                    (new_records, new_spikes, new_critical, new_informal, latest_date, status, notes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (
                        stats.get('new_records',  0),
                        stats.get('new_spikes',   0),
                        stats.get('new_critical', 0),
                        stats.get('new_informal', 0),
                        stats.get('latest_date',  ''),
                        stats.get('status',       'success'),
                        stats.get('notes',        '')
                    ))
        conn.commit()
    log.info("Pipeline run logged to database")
# ─────────────────────────────────────────────────────────────────────────────
# MAIN — Orchestration
# ─────────────────────────────────────────────────────────────────────────────

def run_pipeline():
    log.info("=" * 60)
    log.info("MALAWI FOOD SECURITY — DATA UPDATE PIPELINE")
    log.info(f"Run started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 60)

    stats = {
        'new_records' : 0,
        'new_spikes'  : 0,
        'new_critical': 0,
        'new_informal': 0,
        'latest_date' : '',
        'status'      : 'success',
        'notes'       : ''
    }

    conn = None
    try:
        log.info("Connecting to database...")
        conn = psycopg2.connect(**DB_CONFIG)
        log.info("Connected successfully")

        # --- Download fresh CSV from HDX ---
        df_raw = download_wfp_data()

        # --- Get composite keys already in DB ---
        existing_keys          = get_existing_keys(conn)
        existing_informal_keys = get_existing_informal_keys(conn)

        # --- Split into new standardised rows, full standard, and informal ---
        df_new, df_standard, df_informal = clean_new_data(df_raw, existing_keys)

        # --- If no new standardised rows, check for price revisions ---
        if len(df_new) == 0:
            df_new = detect_revisions(conn, df_standard)
            if len(df_new) == 0:
                # Still process informal even if standardised is up to date
                informal_inserted = process_informal_data(conn, df_informal, existing_informal_keys)
                stats['new_informal'] = informal_inserted
                stats['status'] = 'success'
                stats['notes']  = 'No new standardised data — informal data processed'
                log_pipeline_run(conn, stats)
                return stats
            stats['notes'] = 'Price revisions detected and applied'

        # --- Run spike detection with full historical context ---
        df_history   = load_historical_data(conn)
        df_processed = detect_spikes(df_new, df_history)

        # --- Upsert into prices (handles both new rows and revisions) ---
        inserted = insert_new_data(conn, df_processed)

        # --- Update spikes table and district risk scores ---
        update_spikes_table(conn, df_processed)
        rebuild_district_risk(conn)

        # --- Process informal prices separately ---
        informal_inserted = process_informal_data(conn, df_informal, existing_informal_keys)

        new_spikes   = df_processed[df_processed['spike_severity'] != 'Normal']
        new_critical = df_processed[df_processed['spike_severity'] == 'Critical']

        stats['new_records']  = inserted
        stats['new_spikes']   = len(new_spikes)
        stats['new_critical'] = len(new_critical)
        stats['new_informal'] = informal_inserted
        stats['latest_date']  = str(df_processed['date'].max())
        stats['status']       = 'success'

        log_pipeline_run(conn, stats)

        log.info("=" * 60)
        log.info("PIPELINE COMPLETE")
        log.info(f"  New standardised records : {stats['new_records']:,}")
        log.info(f"  New spike events         : {stats['new_spikes']:,}")
        log.info(f"  New critical events      : {stats['new_critical']:,}")
        log.info(f"  New informal records     : {stats['new_informal']:,}")
        log.info(f"  Latest data date         : {stats['latest_date']}")
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