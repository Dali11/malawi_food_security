# Changelog

## [Phase 2] — 2026-05-07
### Added
- GADM Malawi Level 1 shapefile (28 districts)
- Spatial join: district risk scores to polygon boundaries
- malawi_districts_risk.geojson — choropleth layer
- malawi_districts_risk_utm.geojson — UTM reprojection
- PostgreSQL + PostGIS 3.6 database setup
- Three tables loaded: districts_risk, markets, spikes
- Spatial queries: point-in-polygon, buffer, monitoring gaps
- QGIS choropleth map exported (malawi_district_risk_1.png)
- docs/02_database.md

### Fixed
- City name mismatches: Blantyre City→Blantyre, Lilongwe City→Lilongwe, Mzuzu City→Mzimba
- Likoma island added with zero values (no WFP monitoring)
- Aggregation: sum for counts, mean for rates after city merge

## [Phase 1] — 2026-05-06
### Added
- Raw WFP data loaded: 79,285 records (1990–2026)
- Filtered to 2020–2026 food categories: 39,511 records
- Unit standardisation: split KG/L vs Heap/Bunch/Unit
- Spike detection: dual method (pct_change + rolling zscore)
- Severity classification: Normal/Moderate/Severe/Critical
- District risk ranking: 28 districts scored and ranked
- GeoDataFrame: market points and spike events
- GeoJSON exports: markets, spikes
- Folium interactive preview map
- Professional report: malawi_food_security_report.docx
- docs/01_data_pipeline.md

### Key Findings
- 2,595 spike events (9.18% of observations)
- 215 critical events
- Machinga: highest risk score 436
- Maize: 72% of all critical spike events
- 2025 shows worst crisis period in analysis window



## [Phase 3] — 2026-05-08
### Added
- Spatial indexes on all three PostGIS tables (GIST + btree)
- sql/02_spatial_queries.sql — four spatial queries
- sql/03_monitoring_gaps.sql — monitoring gap classifier
- ST_Within point-in-polygon join
- ST_Distance + ST_Transform buffer query (100km Blantyre)
- Multi-condition spatial query combining risk + severity + distance
- Monitoring gap CASE classification with calibrated thresholds

### Key Findings
- 4 districts with CRITICAL monitoring gap: Mulanje, Machinga, Zomba, Chikwawa
- Thondwe market (Zomba) 37km from Blantyre — 10 critical spikes 2025
- 39% of all markets within 100km of Blantyre
- Karonga: HIGH GAP — 2 markets for risk score 104

### Lessons
- PostgreSQL ROUND() requires ::numeric cast for ST_Distance results
- Use CREATE INDEX IF NOT EXISTS for idempotent scripts
- CASE thresholds need domain calibration — purely numeric logic
  can label the highest risk district as ADEQUATE


cat >> ~/malawi_food_security/CHANGELOG.md << 'EOF'

## [Phase 4] — 2026-05-07
### Added
- FastAPI application with 7 endpoints
- asyncpg connection pool — async PostgreSQL driver
- api/main.py — app entry point with CORS middleware
- api/database.py — connection pool management
- api/routers/districts.py — district GeoJSON endpoints
- api/routers/markets.py — market GeoJSON endpoint
- api/routers/spikes.py — spike events with query filters
- api/routers/summary.py — national statistics endpoint
- Swagger UI at /docs — auto-generated API documentation
- docs/04_api.md

### Configuration
- PostgreSQL TCP authentication changed to md5
- asyncpg installed for async database access
- CORS enabled for Leaflet frontend access

### Endpoints Working
- GET /                          → health check
- GET /api/summary               → national stats
- GET /api/districts             → all 28 districts GeoJSON
- GET /api/districts/{name}      → district detail + markets + spikes
- GET /api/markets               → all 113 markets GeoJSON
- GET /api/spikes                → 2595 spike events (filterable)
- GET /api/spikes/critical       → 215 critical events
- GET /docs                      → Swagger UI

### Key Concept Learned
Browser → Uvicorn → FastAPI → asyncpg pool → PostgreSQL:5432
→ PostGIS spatial query → GeoJSON → HTTP response → Leaflet map
EOF