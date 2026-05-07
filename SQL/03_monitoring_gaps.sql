-- Monitoring Gap Analysis
-- Classifies districts by food security risk vs market coverage
-- Run in: malawi_food_security database

SELECT
    d.name_1                                        AS district,
    d.region                                        AS region,
    ROUND(d.risk_score::numeric, 0)                 AS risk_score,
    COUNT(m.ogc_fid)                                AS market_count,
    ROUND(
        COUNT(m.ogc_fid)::numeric /
        (d.risk_score + 1)::numeric
    , 4)                                            AS coverage_ratio,
    CASE
        WHEN COUNT(m.ogc_fid) = 0
            THEN 'NO MONITORING'
        WHEN d.risk_score > 400
            THEN 'CRITICAL GAP'
        WHEN d.risk_score > 200
         AND COUNT(m.ogc_fid) < 8
            THEN 'CRITICAL GAP'
        WHEN d.risk_score > 100
         AND COUNT(m.ogc_fid) < 4
            THEN 'HIGH GAP'
        WHEN d.risk_score > 50
         AND COUNT(m.ogc_fid) < 2
            THEN 'MODERATE GAP'
        ELSE 'ADEQUATE'
    END                                             AS monitoring_status
FROM districts_risk d
LEFT JOIN markets m
    ON ST_Within(m.wkb_geometry, d.wkb_geometry)
GROUP BY d.name_1, d.region, d.risk_score
ORDER BY coverage_ratio ASC;

-- Key finding: 4 districts with CRITICAL GAP status
-- All Southern Region: Mulanje, Machinga, Zomba, Chikwawa
-- Recommendation: WFP should expand monitoring in these districts
EOF