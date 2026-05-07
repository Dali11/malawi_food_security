-- Run as postgres user
CREATE DATABASE malawi_food_security;
\c malawi_food_security
CREATE EXTENSION postgis;
SELECT PostGIS_version();
EOF

cat > ~/malawi_food_security/sql/02_spatial_queries.sql << 'EOF'
-- Query 1: Markets per district
SELECT d.name_1, COUNT(m.ogc_fid) AS market_count,
       ROUND(d.risk_score::numeric,0) AS risk_score
FROM districts_risk d
LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
GROUP BY d.name_1, d.risk_score
ORDER BY d.risk_score DESC;

-- Query 2: Markets within 100km of Blantyre
SELECT m.market, m.district,
  ROUND(ST_Distance(
    ST_Transform(m.wkb_geometry,32736),
    ST_Transform(
      (SELECT ST_Centroid(wkb_geometry) FROM districts_risk WHERE name_1='Blantyre'),
      32736)) / 1000, 1) AS distance_km
FROM markets m
WHERE ST_Distance(
  ST_Transform(m.wkb_geometry,32736),
  ST_Transform(
    (SELECT ST_Centroid(wkb_geometry) FROM districts_risk WHERE name_1='Blantyre'),
    32736)) / 1000 <= 100
ORDER BY distance_km;

-- Query 3: Critical spikes by district
SELECT d.name_1, d.region, COUNT(s.ogc_fid) AS critical_count,
       ROUND(AVG(s.pct_change)::numeric,1) AS avg_pct_jump
FROM districts_risk d
LEFT JOIN spikes s ON ST_Within(s.wkb_geometry, d.wkb_geometry)
  AND s.spike_severity = 'Critical'
GROUP BY d.name_1, d.region, d.risk_score
HAVING COUNT(s.ogc_fid) > 0
ORDER BY critical_count DESC;
EOF

git add sql/
git commit -m "sql: add database creation and spatial query files"
git push origin master