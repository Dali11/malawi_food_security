# Phase 4 — FastAPI Backend

## Overview
FastAPI serves spatial data from PostGIS to the Leaflet frontend.
Sits between the database and the web map as a REST API.

## Architecture

Browser (Leaflet) → HTTP request → FastAPI → asyncpg → PostGIS
← GeoJSON      ←         ←         ←

## Setup

### Install dependencies
```bash
pip install fastapi uvicorn asyncpg --break-system-packages
```

### Configure PostgreSQL for TCP connections
```bash
# Set postgres password
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '*********';"

# Edit pg_hba.conf — change scram-sha-256 to md5
sudo nano /etc/postgresql/17/main/pg_hba.conf
# host    all    all    127.0.0.1/32    md5

sudo service postgresql restart
```

### Run the API
```bash
cd ~/malawi_food_security
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | Health check |
| GET | /api/summary | National statistics |
| GET | /api/districts | All districts GeoJSON |
| GET | /api/districts/{name} | One district detail |
| GET | /api/markets | All markets GeoJSON |
| GET | /api/spikes | All spikes (filterable) |
| GET | /api/spikes/critical | Critical spikes only |
| GET | /docs | Swagger UI |

## Query Parameters — /api/spikes

| Parameter | Type | Example |
|-----------|------|---------|
| severity | string | ?severity=Critical |
| district | string | ?district=Machinga |
| commodity | string | ?commodity=Maize |
| limit | integer | ?limit=100 |

## File Structure
api/
├── main.py          ← app entry point, CORS, routers
├── database.py      ← asyncpg connection pool
└── routers/
├── districts.py ← /api/districts endpoints
├── markets.py   ← /api/markets endpoints
├── spikes.py    ← /api/spikes endpoints
└── summary.py   ← /api/summary endpoint

## How the Connection Works

### 1. Startup
```python
@app.on_event("startup")
async def startup():
    await connect()   # creates asyncpg pool before accepting requests
```

### 2. Connection pool
```python
pool = await asyncpg.create_pool(**DB_CONFIG)
# Pool keeps 10 connections ready
# Multiple requests handled simultaneously
```

### 3. Query execution
```python
async with pool.acquire() as conn:      # borrow connection
    rows = await conn.fetch("SELECT ... FROM districts_risk")
# connection automatically returned to pool
```

### 4. GeoJSON response
```python
# ST_AsGeoJSON converts PostGIS geometry to GeoJSON string
# Python json.loads() converts string to dict
# FastAPI serialises dict to HTTP JSON response
"geometry": json.loads(row["geometry"])
```

## Key Concepts

### asyncpg vs psycopg2
- psycopg2: synchronous — one request blocks all others
- asyncpg: asynchronous — handles 100 concurrent requests

### $1 parameterised queries
```python
# Safe — prevents SQL injection
await conn.fetchrow("SELECT * FROM districts WHERE name_1 = $1", name)

# Never do this — SQL injection risk
await conn.fetchrow(f"SELECT * FROM districts WHERE name_1 = '{name}'")
```

### CORS middleware
Allows the Leaflet browser app to call the API:
```python
app.add_middleware(CORSMiddleware, allow_origins=["*"])
```

## Common Issues

### Password authentication failed
```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'malawi123';"
# Then change pg_hba.conf scram-sha-256 → md5
# Then restart postgresql
```

### 307 Temporary Redirect
FastAPI redirects missing trailing slashes automatically.
Fix: add redirect_slashes=False to FastAPI() constructor.

### Module not found
Run uvicorn from project root, not from api/ folder:
```bash
cd ~/malawi_food_security   # ← correct
uvicorn api.main:app --reload
```
EOF