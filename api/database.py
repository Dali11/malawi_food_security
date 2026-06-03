import asyncpg
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

DB_CONFIG = {
    "host"    : os.getenv("DB_HOST",     "localhost"),
    "port"    : int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME",     "malawi_food_security"),
    "user"    : os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", "dali@i9i"),
    "ssl"     : os.getenv("DB_SSL",      "require") if os.getenv("DB_HOST", "localhost") != "localhost" else None,
}

pool = None

async def connect():
    global pool
    config = {k: v for k, v in DB_CONFIG.items() if v is not None}
    pool = await asyncpg.create_pool(
        **config,
        statement_cache_size=0,
        min_size=2,
        max_size=5,
    )
    print(f"✅ Database connected: {DB_CONFIG['database']} @ {DB_CONFIG['host']}")

async def disconnect():
    global pool
    if pool:
        await pool.close()

async def get_pool():
    return pool