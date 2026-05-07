-- ============================================================
-- MALAWI FOOD SECURITY GIS — Spatial Queries
-- Database: malawi_food_security
-- PostGIS: 3.6
-- Author: GIS & Food Security Analysis Unit
-- Date: May 2026
-- ============================================================

-- ── POSTGRESQL TYPE CASTING RULES ────────────────────────────
-- ST_Distance()  returns double precision
-- ROUND() only accepts numeric type
-- Always cast before rounding:
-- ROUND((ST_Distance(...) / 1000)::numeric, 1)
-- ─────────────────────────────────────────────────────────────


-- ── INDEXES — run once before queries ────────────────────────
-- Use IF NOT EXISTS so script is safe to re-run

CREATE INDEX IF NOT EXISTS idx_districts_geom
    ON districts_risk USING GIST (wkb_geometry);

CREATE INDEX IF NOT EXISTS idx_markets_geom
    ON markets USING GIST (wkb_geometry);

CREATE INDEX IF NOT EXISTS idx_spikes_geom
    ON spikes USING GIST (wkb_geometry);

CREATE INDEX IF NOT EXISTS idx_spikes_severity
    ON spikes (spike_severity);

CREATE INDEX IF NOT EXISTS idx_spikes_date
    ON spikes (date);


-- ── QUERY 1 — Markets per district ───────────────────────────
-- Uses ST_Within: returns true if point geometry is
-- completely inside polygon geometry
-- This is the SQL equivalent of geopandas gpd.sjoin()
--
-- Result: 28 rows — one per district
-- Shows market count and average spike rate per district

SELECT
    d.name_1                                AS district,
    d.region                                AS region,
    COUNT(m.ogc_fid)                        AS market_count,
    ROUND(d.risk_score::numeric, 0)         AS risk_score,
    ROUND(AVG(m.spike_rate_pct)::numeric,2) AS avg_spike_rate
FROM districts_risk d
LEFT JOIN markets m
    ON ST_Within(m.wkb_geometry, d.wkb_geometry)
GROUP BY d.name_1, d.region, d.risk_score
ORDER BY d.risk_score DESC;


-- ── QUERY 2 — Markets within 100km of Blantyre ───────────────
-- Uses ST_Distance + ST_Transform
-- ST_Transform converts geometry from EPSG:4326 (degrees)
-- to EPSG:32736 (UTM Zone 36S — metres)
-- Distance calculation MUST use metres not degrees
--
-- Result: 44 of 113 markets within 100km
-- Key finding: Lunzu is only 8km from Blantyre centre
-- with 11.69% spike rate — urban food stress confirmed

SELECT
    m.market                                        AS market,
    m.district                                      AS district,
    ROUND(
        (ST_Distance(
            ST_Transform(m.wkb_geometry, 32736),
            ST_Transform(
                (SELECT ST_Centroid(wkb_geometry)
                 FROM districts_risk
                 WHERE name_1 = 'Blantyre'),
                32736
            )
        ) / 1000)::numeric                          -- cast to numeric for ROUND
    , 1)                                            AS distance_km,
    m.total_spikes                                  AS total_spikes,
    ROUND(m.spike_rate_pct::numeric, 2)             AS spike_rate_pct
FROM markets m
WHERE (ST_Distance(
    ST_Transform(m.wkb_geometry, 32736),
    ST_Transform(
        (SELECT ST_Centroid(wkb_geometry)
         FROM districts_risk
         WHERE name_1 = 'Blantyre'),
        32736
    )
) / 1000)::numeric <= 100                          -- cast here too
ORDER BY distance_km;


-- ── QUERY 3 — Critical spikes by district ────────────────────
-- Counts critical spike POINTS that fall inside each
-- district POLYGON using ST_Within spatial join
-- Filters by spike_severity attribute AND date
--
-- Result: which districts had most critical events
-- Uses HAVING to exclude districts with zero critical spikes

SELECT
    d.name_1                                AS district,
    d.region                                AS region,
    COUNT(s.ogc_fid)                        AS critical_spike_count,
    ROUND(d.risk_score::numeric, 0)         AS risk_score,
    ROUND(AVG(s.pct_change)::numeric, 1)    AS avg_pct_jump
FROM districts_risk d
LEFT JOIN spikes s
    ON ST_Within(s.wkb_geometry, d.wkb_geometry)
    AND s.spike_severity = 'Critical'
GROUP BY d.name_1, d.region, d.risk_score
HAVING COUNT(s.ogc_fid) > 0
ORDER BY critical_spike_count DESC
LIMIT 10;


-- ── QUERY 4 — Multi-condition spatial query ───────────────────
-- The most powerful query — combines THREE conditions:
--   1. District risk score > 200 (high risk)
--   2. Had critical spike in 2025 (recent crisis)
--   3. Within 150km of Blantyre (reachable for response)
--
-- This question CANNOT be answered in a spreadsheet —
-- it requires simultaneous spatial + attribute filtering
--
-- Key finding: Machinga markets 73–127km from Blantyre
-- all had 12 critical spikes in 2025 — response is feasible
-- Thondwe (Zomba) 37km away had 10 critical spikes in 2025

SELECT
    m.market                                        AS market,
    m.district                                      AS district,
    d.risk_score                                    AS district_risk_score,
    COUNT(s.ogc_fid)                                AS critical_spikes_2025,
    ROUND(
        (ST_Distance(
            ST_Transform(m.wkb_geometry, 32736),
            ST_Transform(
                (SELECT ST_Centroid(wkb_geometry)
                 FROM districts_risk
                 WHERE name_1 = 'Blantyre'),
                32736
            )
        ) / 1000)::numeric                          -- cast required
    , 1)                                            AS distance_from_blantyre_km
FROM markets m
JOIN districts_risk d
    ON ST_Within(m.wkb_geometry, d.wkb_geometry)
JOIN spikes s
    ON ST_Within(s.wkb_geometry, d.wkb_geometry)
    AND s.spike_severity = 'Critical'
    AND s.date >= '2025-01-01'
WHERE d.risk_score > 200
AND (ST_Distance(
    ST_Transform(m.wkb_geometry, 32736),
    ST_Transform(
        (SELECT ST_Centroid(wkb_geometry)
         FROM districts_risk
         WHERE name_1 = 'Blantyre'),
        32736
    )
) / 1000)::numeric <= 150                          -- cast required
GROUP BY m.market, m.district, d.risk_score, m.wkb_geometry
HAVING COUNT(s.ogc_fid) > 0
ORDER BY critical_spikes_2025 DESC, distance_from_blantyre_km;
EOF