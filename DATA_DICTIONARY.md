# Data Dictionary

## Source: WFP VAM Food Price Database

| Column      | Type    | Description                        |
|-------------|---------|-------------------------------------|
| date        | date    | Monthly observation date (15th)    |
| admin1      | string  | Region (Southern/Central/Northern) |
| admin2      | string  | District name                      |
| market      | string  | Market name                        |
| latitude    | float   | Market latitude (WGS84)            |
| longitude   | float   | Market longitude (WGS84)           |
| category    | string  | Food category                      |
| commodity   | string  | Commodity name                     |
| unit        | string  | Unit of measurement                |
| price       | float   | Retail price in MWK                |
| usdprice    | float   | Retail price in USD                |

## Derived Columns (Phase 1)

| Column         | Type    | Description                              |
|----------------|---------|------------------------------------------|
| pct_change     | float   | Month-over-month % price change          |
| zscore         | float   | Rolling 12-month z-score                 |
| is_spike       | boolean | True when pct≥20 AND zscore≥1.5          |
| spike_severity | string  | Normal/Moderate/Severe/Critical          |

## district_risk table (PostGIS)

| Column         | Type    | Description                              |
|----------------|---------|------------------------------------------|
| name_1         | string  | District name (GADM)                     |
| risk_score     | integer | Weighted composite risk score            |
| critical_count | integer | Count of critical spike events           |
| severe_count   | integer | Count of severe spike events             |
| moderate_count | integer | Count of moderate spike events           |
| spike_rate_pct | float   | % of months with any spike              |
| wkb_geometry   | geometry| District polygon (EPSG:4326)             |

## Units Reference

| Unit  | Commodities                    | Treatment          |
|-------|--------------------------------|--------------------|
| KG    | Maize, Beans, Rice, Sugar...   | Standardised ✅    |
| L     | Oil (vegetable)                | Standardised ✅    |
| Heap  | Fish, leafy vegetables         | Informal — % only  |
| Bunch | Cabbage, Mustard, Rape leaves  | Informal — % only  |
| Unit  | Eggs, Onions, Tomatoes         | Informal — % only  |
EOF