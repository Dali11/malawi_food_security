"""
database.py
Async PostgreSQL connection pool using asyncpg.
Reads all config from environment variables for production safety.
"""

import asyncpg
import os

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
    # Remove ssl key if None to avoid asyncpg error on local
    config = {k: v for k, v in DB_CONFIG.items() if v is not None}
    pool = await asyncpg.create_pool(**config, statement_cache_size=0)
    print(f"✅ Database connected: {DB_CONFIG['database']} @ {DB_CONFIG['host']}")

async def disconnect():
    global pool
    if pool:
        await pool.close()
        print("Database pool closed")

async def get_pool():
    return pool
