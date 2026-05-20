"""
main.py
FastAPI application entry point.
Malawi Food Security GIS API — Phase 4
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.database import connect, disconnect
from api.routers import districts, markets, spikes, summary, reports, compare, narrative, forecast, export, pipeline

# ── App setup ─────────────────────────────────────────────────
app = FastAPI(
    title       = "Malawi Food Security GIS API",
    description = "Spatial food price spike detection and district risk analysis",
    version     = "1.0.0",
    docs_url    = "/docs",     # Swagger UI at /docs
    redoc_url   = "/redoc",    # ReDoc UI at /redoc
)

# ── CORS — allow Leaflet frontend to call this API ────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["*"],    # restrict to your domain in production
    allow_methods  = ["GET"],
    allow_headers  = ["*"],
)

# ── Database lifecycle ────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await connect()

@app.on_event("shutdown")
async def shutdown():
    await disconnect()

# ── Routers ───────────────────────────────────────────────────
app.include_router(districts.router)
app.include_router(markets.router)
app.include_router(spikes.router)
app.include_router(summary.router)
app.include_router(reports.router)
app.include_router(compare.router)
app.include_router(narrative.router)
app.include_router(forecast.router)
app.include_router(export.router)
app.include_router(pipeline.router)

# ── Health check ──────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "status" : "online",
        "api"    : "Malawi Food Security GIS",
        "version": "1.0.0",
        "endpoints": [
            "/api/districts",
            "/api/districts/{name}",
            "/api/markets",
            "/api/spikes",
            "/api/spikes?severity=Critical",
            "/api/spikes/critical",
            "/api/summary",
            "/docs",
        ]
    }
