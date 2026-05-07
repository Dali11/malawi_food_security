# Phase 1 — Data Pipeline

## Overview
Clean WFP raw data → detect price spikes → build GeoDataFrame → export GeoJSON

## Steps

### 1. Load and filter
```python
df = pd.read_csv('food_prices.csv')
df['date'] = pd.to_datetime(df['date'])

# Filter: 2020–2026, food categories only
df = df[
    (df['date'] >= '2020-01-01') &
    (df['date'] <= '2026-04-15') &
    (df['category'].isin(FOOD_CATEGORIES))
]
```

### 2. Clean
```python
df = df[df['market'] != 'National Average']
df = df.dropna(subset=['price'])
df = df.rename(columns={'admin1':'region', 'admin2':'district'})
df = df.sort_values(['district','market','commodity','date'])
```

### 3. Unit split
```python
df_standard = df[df['unit'].isin(['KG','L'])].copy()
df_informal  = df[df['unit'].isin(['Heap','Bunch','Unit'])].copy()
```

### 4. Spike detection
```python
GROUP_KEY = ['district','market','commodity']
df['pct_change'] = df.groupby(GROUP_KEY)['price'].pct_change() * 100
df['zscore']     = df.groupby(GROUP_KEY)['price'].transform(rolling_zscore)
df['is_spike']   = (df['pct_change'] >= 20) & (df['zscore'] >= 1.5)
```

### 5. Severity classification
```python
conditions = [
    (df['pct_change'] >= 60) & (df['zscore'] >= 2.5),
    (df['pct_change'] >= 40) & (df['zscore'] >= 2.0),
    (df['pct_change'] >= 20) & (df['zscore'] >= 1.5),
]
choices = ['Critical', 'Severe', 'Moderate']
df['spike_severity'] = np.select(conditions, choices, default='Normal')
```

### 6. GeoDataFrame
```python
from shapely.geometry import Point
geometry = [Point(lon, lat) for lon, lat in zip(df['longitude'], df['latitude'])]
gdf = gpd.GeoDataFrame(df, geometry=geometry, crs='EPSG:4326')
gdf.to_file('malawi_markets.geojson', driver='GeoJSON')
```

## Output Files
| File | Rows | Description |
|------|------|-------------|
| food_prices_standardised.csv | 28,283 | KG+L only |
| food_prices_informal.csv | 11,228 | Heap/Bunch/Unit |
| food_prices_analysed.csv | 28,283 | With spike flags |
| malawi_markets.geojson | 113 | Market points |
| malawi_spikes.geojson | 2,595 | Spike events |
| malawi_district_risk.csv | 28 | District risk scores |

## Key Results
- 2,595 spike events detected (9.18% of observations)
- 215 critical events
- Machinga: highest risk district (score 436)
- Maize: 72% of all critical events
EOF