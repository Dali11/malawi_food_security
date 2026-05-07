"""
database.py
Async PostgreSQL connection pool using asyncpg.
All API routes share one pool — efficient and production-safe.
"""

import asyncpg
import os

# Connection settings
# In production these come from environment variables
DB_CONFIG = {
    "host"    : os.getenv("DB_HOST",     "localhost"),
    "port"    : int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME",     "malawi_food_security"),
    "user"    : os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}

# Global connection pool
pool = None

async def connect():
    """Create connection pool on startup."""
    global pool
    pool = await asyncpg.create_pool(**DB_CONFIG)
    print(f"Database connected: {DB_CONFIG['database']}")

async def disconnect():
    """Close connection pool on shutdown."""
    global pool
    if pool:
        await pool.close()
        print("Database pool closed")

async def get_pool():
    """Return the active connection pool."""
    return pool
