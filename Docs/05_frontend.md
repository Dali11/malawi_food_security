# Phase 5 — Next.js Web Dashboard

## Overview
React/Next.js dashboard consuming the FastAPI backend.
Three-panel layout: left sidebar → interactive map → right detail panel.

## Tech Stack
- Next.js 14 (App Router)
- React-Leaflet — Leaflet map wrapped for React
- Recharts — price trend charts
- Tailwind CSS v4 — styling
- TypeScript — type safety

## Setup

```bash
cd ~/malawi_food_security/frontend
npm install
npm run dev
# Open http://localhost:3000
```

## Architecture — Component Tree
app/page.tsx                    ← Server Component (no JS shipped)
├── Header                      ← Server Component
├── StatsPanel                  ← Client (useSummary hook)
├── AlertPanel                  ← Client (fetches API)
└── DashboardClient             ← Client Island (owns map state)
├── Filter toolbar          ← severity filter + basemap switcher
├── MapContainer            ← dynamic import (SSR disabled)
│   └── LeafletMap          ← Leaflet map, three layers
│       ├── District layer  ← choropleth polygons
│       ├── Market layer    ← blue dots
│       └── Spike layer     ← filtered by severity
└── DistrictPopup           ← shown on district click
└── PriceChart          ← Recharts line chart
## Key Design Decisions

### Server vs Client components
Server Components → no interactivity needed (Header, page.tsx)
Client Components → need useState/useEffect (map, charts, filters)
Client Island     → DashboardClient owns shared state between
MapContainer and DistrictPopup
### Why dynamic import for Leaflet
Leaflet uses window/document — browser only APIs.
Next.js SSR runs on the server where these do not exist.
Solution: dynamic(() => import('./LeafletMap'), { ssr: false })

### Custom hook pattern
useSummary.ts → fetches API, builds stats array, returns loading state
StatsPanel    → calls useSummary(), renders result
Separation keeps data logic out of presentation components.

### Route order in FastAPI matters
/{district_name}/prices must come BEFORE /{district_name}
FastAPI matches top to bottom — wrong order causes prices
to be treated as a district name parameter.

## File Structure
frontend/
├── app/
│   ├── page.tsx          ← Server Component root
│   ├── layout.tsx        ← HTML shell, metadata, fonts
│   └── globals.css       ← Tailwind v4 + Leaflet overrides
├── components/
│   ├── dashboard/
│   │   ├── Header.tsx
│   │   ├── StatsPanel.tsx
│   │   ├── AlertPanel.tsx
│   │   ├── PriceChart.tsx
│   │   └── DashboardClient.tsx
│   ├── map/
│   │   ├── MapContainer.tsx  ← dynamic loader
│   │   └── LeafletMap.tsx    ← actual map
│   └── popup/
│       └── DistrictPopup.tsx
└── lib/
├── types.ts          ← TypeScript interfaces
├── api.ts            ← all fetch functions
├── utils.ts          ← shadcn utilities
└── hooks/
└── useSummary.ts ← custom hook for summary data
## Features Implemented
- Dark basemap (CARTO) + OpenStreetMap + Satellite switcher
- District choropleth coloured by risk score
- Spike markers filtered by severity (All/Critical/Severe/Moderate)
- Market point layer with popup
- District click → detail panel with full stats
- Price trend chart (Recharts) with commodity selector
- Critical alerts panel with live data
- Key indicators stats panel
- Map legend overlay
- Hover tooltip on districts

## Tailwind v4 Note
This project uses Tailwind CSS v4 which uses @import "tailwindcss"
instead of the v3 @tailwind directives. No tailwind.config.ts needed.
Content paths declared with @source in globals.css.

## Common Issues

### Map not centering on Malawi
Use bounds prop on MapContainer not center+zoom:
```tsx
<MapContainer bounds={MALAWI_BOUNDS} boundsOptions={{ padding: [20,20] }}>
```

### Leaflet triangle (unstyled SVG)
Tailwind not loading. Check globals.css starts with @import "tailwindcss"
and layout.tsx imports ./globals.css.

### Module not found for components
Linux is case-sensitive. Import path must match folder name exactly.
Use lowercase folder names and match imports accordingly.
