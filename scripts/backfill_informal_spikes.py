"""
backfill_informal_spikes.py
One-time script to recompute pct_change, zscore, is_spike, and spike_severity
for all rows in prices_informal using full historical context.

Run once after the pipeline has populated prices_informal.
Safe to re-run — uses ON CONFLICT DO UPDATE.
"""

import pandas as pd
import numpy as np
import psycopg2
import psycopg2.extras
import os
import logging
import sys
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

DB_CONFIG = {
    "host"    : os.getenv("DB_HOST",     "aws-0-eu-west-1.pooler.supabase.com"),
    "port"    : int(os.getenv("DB_PORT", "5432")),
    "dbname"  : os.getenv("DB_NAME",     "postgres"),
    "user"    : os.getenv("DB_USER",     "postgres.dnqtmkkuqrkcyavysobm"),
    "password": os.getenv("DB_PASSWORD", "dalitsokamphani"),
}

def run_backfill():
    log.info("=" * 60)
    log.info("INFORMAL PRICES — SPIKE DETECTION BACKFILL")
    log.info("=" * 60)

    conn = psycopg2.connect(**DB_CONFIG)

    # ── Load all informal rows from DB ──────────────────────────────
    log.info("Loading all rows from prices_informal...")
    with conn.cursor() as cur:
        cur.execute("""
                    SELECT id, date, region, district, market, market_id,
                        latitude, longitude, category, commodity, commodity_id,
                        unit, priceflag, pricetype, currency,
                        price, usdprice
                    FROM prices_informal
                    ORDER BY district, market, commodity, date
                    """)
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]

    df = pd.DataFrame(rows, columns=cols)
    log.info(f"Loaded {len(df):,} rows")

    df['date']  = pd.to_datetime(df['date'])
    df['price'] = pd.to_numeric(df['price'], errors='coerce')
    df = df.dropna(subset=['price'])

    # ── Recompute pct_change ────────────────────────────────────────
    GROUP_KEY = ['district', 'market', 'commodity']
    df = df.sort_values(GROUP_KEY + ['date']).reset_index(drop=True)
    df['pct_change'] = df.groupby(GROUP_KEY)['price'].pct_change() * 100

    # ── Recompute rolling zscore ────────────────────────────────────
    def rolling_zscore(series, window=12):
        roll = series.rolling(window, min_periods=3)
        return (series - roll.mean()) / roll.std()

    df['zscore'] = df.groupby(GROUP_KEY)['price'].transform(rolling_zscore)

    # ── Classify spikes ─────────────────────────────────────────────
    conditions = [
        (df['pct_change'] >= 60) & (df['zscore'] >= 2.5),
        (df['pct_change'] >= 40) & (df['zscore'] >= 2.0),
        (df['pct_change'] >= 20) & (df['zscore'] >= 1.5),
        ]
    choices = ['Critical', 'Severe', 'Moderate']
    df['spike_severity'] = np.select(conditions, choices, default='Normal')
    df['is_spike']       = df['spike_severity'] != 'Normal'

    # ── Summary ─────────────────────────────────────────────────────
    log.info("Spike detection results:")
    for sev, count in df['spike_severity'].value_counts().items():
        log.info(f"  {sev:10s}: {count:,}")
    log.info(f"  Rows with zscore : {df['zscore'].notna().sum():,}")
    log.info(f"  Rows NULL zscore : {df['zscore'].isna().sum():,}  (insufficient history — expected)")

    # ── Bulk update via temp table ──────────────────────────────────
    log.info("Updating prices_informal via bulk UPDATE...")

    df['date_str'] = df['date'].astype(str)
    df['is_spike_bool'] = df['is_spike'].astype(bool)

    # Replace NaN with None for psycopg2
    def safe_float(val):
        if pd.isna(val):
            return None
        return float(val)

    records = [
        (
            safe_float(row['pct_change']),
            safe_float(row['zscore']),
            bool(row['is_spike']),
            row['spike_severity'],
            int(row['id'])
        )
        for _, row in df.iterrows()
    ]

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            UPDATE prices_informal AS pi
            SET
                pct_change     = data.pct_change,
                zscore         = data.zscore,
                is_spike       = data.is_spike,
                spike_severity = data.spike_severity
                FROM (VALUES %s) AS data(pct_change, zscore, is_spike, spike_severity, id)
            WHERE pi.id = data.id::integer
            """,
            records,
            template="(%s, %s, %s, %s, %s)",
            page_size=2000
        )
        conn.commit()

    log.info(f"Updated {len(records):,} rows successfully")

    # ── Verify ──────────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("""
                    SELECT spike_severity, COUNT(*)
                    FROM prices_informal
                    GROUP BY spike_severity
                    ORDER BY COUNT(*) DESC
                    """)
        rows = cur.fetchall()

    log.info("Verification — DB counts after update:")
    for row in rows:
        log.info(f"  {row[0]:10s}: {row[1]:,}")

    conn.close()
    log.info("=" * 60)
    log.info("BACKFILL COMPLETE")
    log.info("=" * 60)


if __name__ == "__main__":
    run_backfill()