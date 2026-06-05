import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts"
import type { ForecastData } from "@/lib/types"
import { riskColor }         from "@/lib/hooks/useColor"

interface Props { data: ForecastData }

export function ForecastChart({ data }: Props) {
    const chartData = data.forecast.map(f => ({
        name       : f.month_label.split(" ")[0],   // "April"
        year       : f.month_label.split(" ")[1],   // "2026"
        season     : f.season.split(" ")[0],        // "Harvest"
        forecast   : Math.round(f.forecast),
        lower      : Math.round(f.lower_bound),
        upper      : Math.round(f.upper_bound),
        risk       : f.risk_level,
        pct        : f.pct_vs_baseline,
    }))

    const baseline = data.baseline_price

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null
        const d = payload[0]?.payload
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs shadow-xl">
                <p className="font-semibold text-white mb-1">{d?.name} {d?.year}</p>
                <p className="text-slate-300">{d?.season} season</p>
                <p className="mt-1" style={{ color: riskColor(d?.risk) }}>
                    {d?.forecast?.toLocaleString()} MWK
                    <span className="ml-1.5 text-slate-400">
            ({d?.pct > 0 ? "+" : ""}{d?.pct}% vs baseline)
          </span>
                </p>
                <p className="text-slate-400 mt-0.5">
                    Range: {d?.lower?.toLocaleString()} – {d?.upper?.toLocaleString()}
                </p>
            </div>
        )
    }

    const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)

    return (
        <ResponsiveContainer width="100%" height={160}>
            <ComposedChart
                data={chartData}
                margin={{ top: 20, right: 16, left: 8, bottom: 0 }}
                barCategoryGap="40%"
            >
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)"/>

                <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }}
                />

                <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmt}
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    width={36}
                />

                <Tooltip content={<CustomTooltip/>} cursor={{ fill: "rgba(255,255,255,0.04)" }}/>

                {/* Baseline reference line */}
                <ReferenceLine
                    y={baseline}
                    stroke="#F5C842"
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{
                        value  : `baseline ${fmt(baseline)} MWK`,
                        position: "insideTopRight",
                        fontSize: 11,
                        fill   : "#F5C842",
                        dy     : -6,
                    }}
                />

                {/* Bars — coloured by risk level */}
                <Bar dataKey="forecast" radius={[3, 3, 0, 0]}
                     label={{
                         position: "top",
                         fontSize : 10,
                         fontWeight: 700,
                         formatter: (v: unknown) => fmt(Number(v)),
                         fill     : "currentColor",
                     }}>
                    {chartData.map((d, i) => (
                        <Cell key={i} fill={riskColor(d.risk)} fillOpacity={0.85}/>
                    ))}
                </Bar>

            </ComposedChart>
        </ResponsiveContainer>
    )
}