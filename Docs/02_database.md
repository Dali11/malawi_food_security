# Phase 2 & 3 — Spatial Database

## Setup

### Install PostGIS on Kali/Debian
```bash
sudo apt install postgresql postgresql-18-postgis-3 -y
sudo service postgresql start
```

### Create database
```bash
sudo -u postgres psql
```
```sql
CREATE DATABASE malawi_food_security;
\c malawi_food_security
CREATE EXTENSION postgis;
SELECT PostGIS_version();
\q
```

### Load spatial data
```bash
# Districts with risk scores
sudo -u postgres ogr2ogr \
  -f "PostgreSQL" \
  "PG:dbname=malawi_food_security" \
  malawi_districts_risk.geojson \
  -nln districts_risk -overwrite

# Market points
sudo -u postgres ogr2ogr \
  -f "PostgreSQL" \
  "PG:dbname=malawi_food_security" \
  malawi_markets.geojson \
  -nln markets -overwrite

# Spike events
sudo -u postgres ogr2ogr \
  -f "PostgreSQL" \
  "PG:dbname=malawi_food_security" \
  malawi_spikes.geojson \
  -nln spikes -overwrite
```

## Tables

| Table | Rows | Description |
|-------|------|-------------|
| districts_risk | 28 | District polygons + risk scores |
| markets | 113 | Market point locations |
| spikes | 2,595 | Spike event points |
| spatial_ref_sys | — | PostGIS system table |

## Spatial Queries

### Markets per district
```sql
SELECT d.name_1, COUNT(m.ogc_fid) AS market_count
FROM districts_risk d
LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
GROUP BY d.name_1
ORDER BY market_count DESC;
```

### Markets within 100km of Blantyre
```sql
SELECT m.market, m.district,
  ROUND(ST_Distance(
    ST_Transform(m.wkb_geometry, 32736),
    ST_Transform(
      (SELECT ST_Centroid(wkb_geometry) FROM districts_risk WHERE name_1='Blantyre'),
      32736)
  ) / 1000, 1) AS distance_km
FROM markets m
WHERE ST_Distance(
  ST_Transform(m.wkb_geometry, 32736),
  ST_Transform(
    (SELECT ST_Centroid(wkb_geometry) FROM districts_risk WHERE name_1='Blantyre'),
    32736)
) / 1000 <= 100
ORDER BY distance_km;
```

## Common Issues & Fixes

### Peer authentication failed
```bash
# Run ogr2ogr as postgres system user
sudo -u postgres ogr2ogr ...
```

### PostGIS extension not found
```bash
sudo apt install postgresql-18-postgis-3 -y
```

### Wrong table name
Always verify count after each load:
```bash
sudo -u postgres psql -d malawi_food_security -c "SELECT COUNT(*) FROM table_name;"
```


#  ===========Phase 3 findings========================

## Phase 3 Results — Spatial Query Findings

### Monitoring Gap Analysis
| District | Risk Score | Markets | Status       |
|----------|------------|---------|--------------|
| Likoma   | 0          | 0       | NO MONITORING|
| Mulanje  | 277        | 5       | CRITICAL GAP |
| Machinga | 436        | 8       | CRITICAL GAP |
| Zomba    | 262        | 5       | CRITICAL GAP |
| Chikwawa | 217        | 5       | CRITICAL GAP |
| Karonga  | 104        | 2       | HIGH GAP     |

### Key Spatial Findings
- 44 of 113 markets (39%) within 100km of Blantyre
- Thondwe (Zomba) is 37km from Blantyre with 10 critical spikes in 2025
- Machinga markets 73–127km from Blantyre all had 12 critical spikes in 2025
- 4 Southern Region districts classified as CRITICAL monitoring gap

### PostgreSQL Type Casting Rule
ST_Distance returns double precision — always cast before ROUND():
```sql
ROUND((ST_Distance(...) / 1000)::numeric, 1)
```
EOF