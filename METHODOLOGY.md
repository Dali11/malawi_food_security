# Methodology

## Spike Detection — Dual Method Approach

All spike detection uses two conditions that must BOTH be true:

### Method 1: Month-over-Month Percentage Change
```python
df['pct_change'] = df.groupby(
    ['district', 'market', 'commodity']
)['price'].pct_change() * 100
```
Detects sudden price jumps within a single month.

### Method 2: Rolling 12-Month Z-Score
```python
def rolling_zscore(series, window=12):
    roll = series.rolling(window, min_periods=3)
    return (series - roll.mean()) / roll.std()
```
Detects prices that are statistically abnormal vs recent history.
Catches slow-building crises that pct_change alone misses.

## Severity Classification (WFP ALPS Framework)

| Severity | % Change | Z-Score | Action          |
|----------|----------|---------|-----------------|
| Normal   | < 20%    | < 1.5   | No action       |
| Moderate | ≥ 20%    | ≥ 1.5   | Monitor closely |
| Severe   | ≥ 40%    | ≥ 2.0   | Prepare response|
| Critical | ≥ 60%    | ≥ 2.5   | Immediate action|

## District Risk Score

Weighted composite score:
risk_score = (critical_count × 3) + (severe_count × 2) + (moderate_count × 1)

## Unit Standardisation Decision

Data split into two files:
- **Standardised** (KG + L): used for spike detection
- **Informal** (Heap/Bunch/Unit): tracked by % change only

Reason: Heap sizes vary by season and vendor.
Converting heap→KG introduces 20–50% estimation error.

## Coordinate Systems

| Purpose              | CRS         | Unit    |
|----------------------|-------------|---------|
| Web maps / display   | EPSG:4326   | Degrees |
| Distance / area calc | EPSG:32736  | Metres  |
EOF