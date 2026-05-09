# Malawi Food Security GIS Monitor

A data-driven GIS system for tracking food price spikes across
Malawi's 28 districts and 130 markets — built on WFP VAM data.

## Live System

| Service   | URL                                                      |
|-----------|----------------------------------------------------------|
| Dashboard | https://malawi-food-security.vercel.app                  |
| API       | https://web-production-86b19.up.railway.app              |
| API Docs  | https://web-production-86b19.up.railway.app/docs         |
| GitHub    | https://github.com/Dali11/malawi_food_security           |

## Purpose
Detect food price shocks early, rank districts by food security
risk, and serve spatial intelligence to decision makers through
an interactive web map dashboard.

## Key Findings (2020-2026)
- Machinga: highest risk district (score: 436)
- 72% of all critical events involve maize
- September 2025 post-harvest spike indicates structural supply failure
- Southern Region: 56.7% of all critical events
- 4 districts with critical monitoring gaps: Mulanje, Machinga, Zomba, Chikwawa

## System Architecture
WFP CSV → Python/Pandas → PostGIS → FastAPI → Next.js

## Tech Stack
- Data Analysis : Python, pandas, numpy, geopandas
- Spatial DB    : PostgreSQL + PostGIS (Supabase)
- Desktop GIS   : QGIS, GDAL/OGR
- API           : FastAPI + asyncpg (Railway)
- Frontend      : Next.js + React-Leaflet + Recharts (Vercel)

## Build Progress
- [x] Phase 1 — Data cleaning, spike detection, GeoDataFrame
- [x] Phase 2 — QGIS choropleth, spatial joins, PostGIS setup
- [x] Phase 3 — PostGIS spatial SQL queries and indexes
- [x] Phase 4 — FastAPI REST API (8 endpoints)
- [x] Phase 5 — Next.js web dashboard
- [x] Deployment — Vercel + Railway + Supabase

## Local Development

### Prerequisites
- Python 3.13+
- Node.js 22+
- PostgreSQL 18 + PostGIS

### Start API locally
```bash
cd ~/malawi_food_security
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### Start Frontend locally
```bash
cd ~/malawi_food_security/frontend
npm run dev
# Open http://localhost:3000
```

## Data Source
WFP VAM Food Price Database — Malawi
79,285 records | Oct 1990 – Apr 2026
Analysis window: Jan 2020 – Apr 2026

## Documentation
See /docs/ folder for detailed phase-by-phase documentation.
