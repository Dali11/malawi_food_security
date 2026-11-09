import asyncpg
from dotenv import load_dotenv
from pathlib import Path

from api.db_config import build_db_config

load_dotenv(Path(__file__).parent / ".env")


pool = None

async def connect():
    global pool
    config = build_db_config("asyncpg")
    pool = await asyncpg.create_pool(
        **config,
        statement_cache_size=0,
        min_size=2,
        max_size=5,
    )
    print(f"✅ Database connected: {config['database']} @ {config['host']}")

async def disconnect():
    global pool
    if pool:
        await pool.close()

async def get_pool():
    return pool