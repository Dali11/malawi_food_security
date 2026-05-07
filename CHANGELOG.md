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
EOF