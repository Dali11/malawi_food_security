"use client";

import { DISTRICTS } from "@/lib/constants";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────
interface Commodity {
  commodity: string;
  critical_count: number;
  total_spikes: number;
}

interface District {
  name: string;
  region: string;
  risk_score: number;
  critical_count: number;
  severe_count: number;
  moderate_count: number;
  spike_rate_pct: number;
  market_count: number;
  avg_price: number;
  top_commodities: Commodity[];
}

interface CompareResult {
  district_a: District;
  district_b: District;
}

// ── Constants ─────────────────────────────────────────────────


// ── Risk helpers ──────────────────────────────────────────────
function riskLabel(score: number) {
  if (score >= 277) return "Critical";
  if (score >= 199) return "High";
  if (score >= 126) return "Moderate";
  if (score >= 59)  return "Low";
  return "Stable";
}

function riskColor(score: number) {
  if (score >= 277) return "#B71C1C";
  if (score >= 199) return "#E65100";
  if (score >= 126) return "#F9A825";
  if (score >= 59)  return "#1565C0";
  return "#2E7D32";
}

function riskBg(score: number) {
  if (score >= 277) return "#FCEBEB";
  if (score >= 199) return "#FFF3E0";
  if (score >= 126) return "#FAEEDA";
  if (score >= 59)  return "#E6F1FB";
  return "#EAF3DE";
}

// ── Sub-components ────────────────────────────────────────────
function RiskBadge({ score }: { score: number }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 500,
      background: riskBg(score),
      color: riskColor(score),
    }}>
      {riskLabel(score)} risk
    </span>
  );
}

function MetricCard({
  label, valA, valB, nameA, nameB, format = (v: number) => v.toLocaleString(),
}: {
  label: string;
  valA: number;
  valB: number;
  nameA: string;
  nameB: string;
  format?: (v: number) => string;
}) {
  const winner = valA > valB ? "a" : valB > valA ? "b" : "tie";
  return (
    <div style={{
      background: "var(--color-background-secondary)",
      borderRadius: 8,
      padding: "12px 14px",
    }}>
      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{
          fontSize: 20, fontWeight: 500,
          color: winner === "a" ? "#B71C1C" : "var(--color-text-primary)",
        }}>
          {format(valA)}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>vs</span>
        <span style={{
          fontSize: 20, fontWeight: 500,
          color: winner === "b" ? "#B71C1C" : "var(--color-text-primary)",
        }}>
          {format(valB)}
        </span>
      </div>
      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
        {nameA} · {nameB}
      </p>
    </div>
  );
}

function MirroredBar({
  label, valA, valB, maxVal, colorA, colorB,
}: {
  label: string; valA: number; valB: number; maxVal: number;
  colorA: string; colorB: string;
}) {
  const pctA = maxVal > 0 ? (valA / maxVal) * 100 : 0;
  const pctB = maxVal > 0 ? (valB / maxVal) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "var(--color-text-primary)" }}>{valA}</span>
        <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ color: "var(--color-text-primary)" }}>{valB}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 8px 1fr", gap: 4, alignItems: "center" }}>
        <div style={{ background: "var(--color-border-tertiary)", borderRadius: 4, height: 6, overflow: "hidden", direction: "rtl" }}>
          <div style={{ width: `${pctA}%`, height: 6, background: colorA, borderRadius: 4 }} />
        </div>
        <div />
        <div style={{ background: "var(--color-border-tertiary)", borderRadius: 4, height: 6, overflow: "hidden" }}>
          <div style={{ width: `${pctB}%`, height: 6, background: colorB, borderRadius: 4 }} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ComparisonPanel({ onClose }: { onClose: () => void }) {
  const [districtA, setDistrictA] = useState("Machinga");
  const [districtB, setDistrictB] = useState("Zomba");
  const [data, setData]           = useState<CompareResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  async function fetchComparison() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API}/api/compare/?district_a=${encodeURIComponent(districtA)}&district_b=${encodeURIComponent(districtB)}`
      );
      if (!res.ok) throw new Error("Failed to fetch comparison data");
      const json = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Fetch on mount and when districts change
  useEffect(() => {
    fetchComparison();
  }, [districtA, districtB]);

  const A = data?.district_a;
  const B = data?.district_b;
  const maxSpikes = A && B ? Math.max(
    A.critical_count + A.severe_count + A.moderate_count,
    B.critical_count + B.severe_count + B.moderate_count,
  ) : 1;

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0,
      width: 480, background: "#0F172A",
      borderLeft: "1px solid rgba(255,255,255,0.08)",
      zIndex: 1000, overflowY: "auto",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#1B3A6B",
      }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>District comparison</p>
          <p style={{ fontSize: 12, color: "#A8C4E8", marginTop: 2 }}>Side-by-side risk analysis</p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.1)", border: "none",
            borderRadius: 6, padding: "6px 10px", cursor: "pointer",
            color: "#fff", fontSize: 13,
          }}
        >
          ✕ Close
        </button>
      </div>

      <div style={{ padding: "16px 20px", flex: 1 }}>

        {/* District selectors */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 11, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>District A</p>
            <select
              value={districtA}
              onChange={e => setDistrictA(e.target.value)}
              style={{
                width: "100%", background: "#1E293B",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "6px 8px",
                color: "#fff", fontSize: 13,
              }}
            >
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <span style={{ fontSize: 12, color: "#64748B", paddingTop: 16 }}>vs</span>
          <div>
            <p style={{ fontSize: 11, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>District B</p>
            <select
              value={districtB}
              onChange={e => setDistrictB(e.target.value)}
              style={{
                width: "100%", background: "#1E293B",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "6px 8px",
                color: "#fff", fontSize: 13,
              }}
            >
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Loading / error */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#64748B", fontSize: 13 }}>
            Loading comparison...
          </div>
        )}
        {error && (
          <div style={{ background: "#FCEBEB", borderRadius: 6, padding: "10px 14px", color: "#B71C1C", fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Results */}
        {A && B && !loading && (
          <>
            {/* Risk badges */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#fff", marginBottom: 4 }}>{A.name}</p>
                <p style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>{A.region}</p>
                <RiskBadge score={A.risk_score} />
                <p style={{ fontSize: 18, fontWeight: 500, color: riskColor(A.risk_score), marginTop: 4 }}>
                  {A.risk_score}
                </p>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />
              <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#fff", marginBottom: 4 }}>{B.name}</p>
                <p style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>{B.region}</p>
                <RiskBadge score={B.risk_score} />
                <p style={{ fontSize: 18, fontWeight: 500, color: riskColor(B.risk_score), marginTop: 4 }}>
                  {B.risk_score}
                </p>
              </div>
            </div>

            {/* Metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <MetricCard label="Critical spikes" valA={A.critical_count} valB={B.critical_count} nameA={A.name} nameB={B.name} />
              <MetricCard label="Spike rate" valA={A.spike_rate_pct} valB={B.spike_rate_pct} nameA={A.name} nameB={B.name} format={v => `${v.toFixed(1)}%`} />
              <MetricCard label="Markets" valA={A.market_count} valB={B.market_count} nameA={A.name} nameB={B.name} />
              <MetricCard label="Avg price (MWK)" valA={A.avg_price} valB={B.avg_price} nameA={A.name} nameB={B.name} format={v => v.toLocaleString()} />
            </div>

            {/* Mirrored bars */}
            <div style={{ background: "#1E293B", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                Risk breakdown
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748B", marginBottom: 8 }}>
                <span>{A.name}</span>
                <span>{B.name}</span>
              </div>
              <MirroredBar label="Critical" valA={A.critical_count} valB={B.critical_count} maxVal={maxSpikes} colorA="#B71C1C" colorB="#B71C1C" />
              <MirroredBar label="Severe"   valA={A.severe_count}   valB={B.severe_count}   maxVal={maxSpikes} colorA="#E65100" colorB="#E65100" />
              <MirroredBar label="Moderate" valA={A.moderate_count} valB={B.moderate_count} maxVal={maxSpikes} colorA="#F9A825" colorB="#F9A825" />
            </div>

            {/* Top commodities */}
            <div style={{ background: "#1E293B", borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                Top affected commodities
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: 8 }}>{A.name}</p>
                  {A.top_commodities.map(c => (
                    <div key={c.commodity} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "#CBD5E1" }}>{c.commodity}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 500, padding: "1px 6px",
                        borderRadius: 4,
                        background: c.critical_count > 0 ? "#FCEBEB" : "#F8F9FA",
                        color: c.critical_count > 0 ? "#B71C1C" : "#64748B",
                      }}>
                        {c.critical_count} crit
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: 8 }}>{B.name}</p>
                  {B.top_commodities.map(c => (
                    <div key={c.commodity} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "#CBD5E1" }}>{c.commodity}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 500, padding: "1px 6px",
                        borderRadius: 4,
                        background: c.critical_count > 0 ? "#FCEBEB" : "#F8F9FA",
                        color: c.critical_count > 0 ? "#B71C1C" : "#64748B",
                      }}>
                        {c.critical_count} crit
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}