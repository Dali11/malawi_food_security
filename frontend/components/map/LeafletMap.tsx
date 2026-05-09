"use client"

import { useEffect, useState } from "react"
import {
  MapContainer, TileLayer, GeoJSON,
  CircleMarker, Popup, useMap
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
import L from "leaflet"
import type { Feature } from "geojson"
import type { GeoJsonObject } from "geojson"
import type {
  DistrictCollection, MarketCollection,
  SpikeCollection, DistrictDetail
} from "@/lib/types"
import {
  getDistricts, getMarkets, getSpikes,
  getRiskColor, getSeverityColor, getDistrict
} from "@/lib/api"
import type { BasemapConfig } from "./MapContainer"

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl      : "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl    : "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
})

const MALAWI_BOUNDS: L.LatLngBoundsExpression = [
  [-17.13, 32.67],
  [-9.36,  35.92],
]

function FitMalawi() {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(MALAWI_BOUNDS, { padding: [20, 20] })
  }, [map])
  return null
}

interface LeafletMapProps {
  onDistrictClick : (district: DistrictDetail | null) => void
  severityFilter  : string
  basemap         : BasemapConfig
}

export default function LeafletMap({
  onDistrictClick,
  severityFilter,
  basemap,
}: LeafletMapProps) {
  const [districts, setDistricts] = useState<DistrictCollection | null>(null)
  const [markets,   setMarkets  ] = useState<MarketCollection   | null>(null)
  const [spikes,    setSpikes   ] = useState<SpikeCollection    | null>(null)
  const [loading,   setLoading  ] = useState(true)

  // Load districts and markets once
  useEffect(() => {
    async function loadBase() {
      try {
        const [d, m] = await Promise.all([getDistricts(), getMarkets()])
        setDistricts(d)
        setMarkets(m)
      } catch (err) {
        console.error("Failed to load base layers:", err)
      } finally {
        setLoading(false)
      }
    }
    loadBase()
  }, [])

  // Reload spikes when severity filter changes
  useEffect(() => {
    const params = severityFilter === "All"
      ? {}
      : { severity: severityFilter }

    getSpikes(params)
      .then(setSpikes)
      .catch(console.error)
  }, [severityFilter])

  function districtStyle(feature?: Feature) {
    const score = feature?.properties?.risk_score ?? 0
    return {
      fillColor  : getRiskColor(score),
      fillOpacity: 0.75,
      color      : "#ffffff",
      weight     : 1.5,
    }
  }

  function onEachDistrict(feature: Feature, layer: L.Layer) {
    const p = feature.properties ?? {}
    layer.on({
      mouseover: (e) => {
        const l = e.target as L.Path
        l.setStyle({ weight: 3, color: "#ffffff", fillOpacity: 0.95 })
        l.bringToFront()
      },
      mouseout: (e) => {
        const l = e.target as L.Path
        l.setStyle(districtStyle(feature))
      },
      click: async () => {
        try {
          const detail = await getDistrict(p.district)
          onDistrictClick(detail)
        } catch (err) {
          console.error("District detail failed:", err)
        }
      }
    })
    layer.bindTooltip(
      `<b>${p.district}</b><br/>Risk: ${p.risk_score} | Critical: ${p.critical_count}`,
      { sticky: true, className: "map-tooltip" }
    )
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900">
        <p className="text-slate-400 font-mono text-sm animate-pulse">
          Loading spatial layers...
        </p>
      </div>
    )
  }

  return (
    <MapContainer
      bounds={MALAWI_BOUNDS}
      boundsOptions={{ padding: [20, 20] }}
      className="w-full h-full"
      zoomControl={true}
    >
      {/* Basemap — key forces remount when URL changes */}
      <TileLayer
        key={basemap.url}
        url={basemap.url}
        attribution={`&copy; ${basemap.attr}`}
      />

      <FitMalawi />

      {/* District choropleth */}
      {districts && (
        <GeoJSON
          key="districts"
          data={districts as unknown as GeoJsonObject}
          style={districtStyle}
          onEachFeature={onEachDistrict}
        />
      )}

      {/* Market points */}
      {markets?.features.map((f, i) => {
        const [lng, lat] = f.geometry.coordinates
        const p = f.properties
        return (
          <CircleMarker
            key={`market-${i}`}
            center={[lat, lng]}
            radius={5}
            pathOptions={{
              color: "#ffffff", weight: 1,
              fillColor: "#1565C0", fillOpacity: 0.9,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-bold text-sm">{p.market}</div>
                <div>District: {p.district}</div>
                <div>Commodities: {p.num_commodities}</div>
                <div>Total spikes: {p.total_spikes}</div>
                <div>Spike rate: {p.spike_rate_pct}%</div>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}

      {/* Spike markers — filtered by severityFilter */}
      {spikes?.features.map((f, i) => {
        const [lng, lat] = f.geometry.coordinates
        const p = f.properties
        const color = getSeverityColor(p.spike_severity)
        return (
          <CircleMarker
            key={`spike-${i}`}
            center={[lat, lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff", weight: 1.5,
              fillColor: color, fillOpacity: 0.9,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-bold text-sm" style={{ color }}>
                  ⚠ {p.spike_severity} Spike
                </div>
                <div>Market: <b>{p.market}</b></div>
                <div>Commodity: <b>{p.commodity}</b></div>
                <div>Price: {p.price_mwk.toLocaleString()} MWK</div>
                <div>Jump: <b style={{ color }}>+{p.pct_change}%</b></div>
                <div>Date: {p.date}</div>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}

    </MapContainer>
  )
}
