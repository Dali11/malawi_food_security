import { riskColor } from "@/lib/hooks/useColor"
import { ForecastData } from "@/lib/types"

export function ForecastChart({ data }: { data: ForecastData }) {
    const maxPrice  = Math.max(...data.forecast.map(f => f.upper_bound)) * 1.2
    const baseline  = data.baseline_price
    const n         = data.forecast.length
    const W         = 560
    const H         = 150
    const PAD_L     = 52
    const PAD_B     = 36
    const PAD_T     = 18
    const chartW    = W - PAD_L - 20
    const chartH    = H - PAD_B - PAD_T
    const barW      = Math.min(32, (chartW / n) * 0.32)
    const gap       = (chartW - n * barW) / (n + 1)

    const toY = (price: number) => PAD_T + chartH - (price / maxPrice) * chartH

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">

            {/* Grid lines + Y labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                const y     = toY(maxPrice * t)
                const price = Math.round(maxPrice * t)
                return (
                    <g key={i}>
                        <line x1={PAD_L} y1={y} x2={W - 20} y2={y}
                              stroke="currentColor" strokeWidth="0.5" opacity="0.15"/>
                        <text x={PAD_L - 5} y={y + 4} fontSize="9"
                              fill="currentColor" opacity="0.5" textAnchor="end">
                            {price >= 1000 ? `${(price / 1000).toFixed(1)}k` : price}
                        </text>
                    </g>
                )
            })}

            {/* Baseline */}
            <line x1={PAD_L} y1={toY(baseline)} x2={W - 20} y2={toY(baseline)}
                  stroke="#F5C842" strokeWidth="1.5" strokeDasharray="5,3"/>
            <text x={PAD_L + 6} y={toY(baseline) - 4} fontSize="8" fill="#F5C842">
                baseline {baseline.toLocaleString()} MWK
            </text>

            {/* Bars */}
            {data.forecast.map((f, i) => {
                const x     = PAD_L + gap + i * (barW + gap)
                const yBar  = toY(f.forecast)
                const yLow  = toY(f.lower_bound)
                const yHigh = toY(f.upper_bound)
                const barH  = H - PAD_B - yBar
                const color = riskColor(f.risk_level)
                const cx    = x + barW / 2

                return (
                    <g key={i}>
                        {/* Confidence band */}
                        <rect x={x + barW * 0.05} y={yHigh}
                              width={barW * 0.9} height={Math.abs(yLow - yHigh)}
                              fill={color} opacity="0.12" rx="2"/>
                        {/* Bar */}
                        <rect x={x} y={yBar} width={barW} height={barH}
                              fill={color} opacity="0.82" rx="3"/>
                        {/* Price label */}
                        <text x={cx} y={yBar - 5} fontSize="10"
                              fill={color} textAnchor="middle" fontWeight="700">
                            {f.forecast >= 1000
                                ? `${(f.forecast / 1000).toFixed(1)}k`
                                : f.forecast}
                        </text>
                        {/* Season */}
                        <text x={cx} y={H - PAD_B + 10}
                              fontSize="7.5" fill="currentColor" opacity="0.45"
                              textAnchor="middle">
                            {f.season.split(" ")[0]}
                        </text>
                        {/* Month */}
                        <text x={cx} y={H - PAD_B + 21}
                              fontSize="9.5" fill="currentColor" opacity="0.7"
                              textAnchor="middle" fontWeight="500">
                            {f.month_label.split(" ")[0]}
                        </text>
                        {/* Year */}
                        <text x={cx} y={H - PAD_B + 31}
                              fontSize="7.5" fill="currentColor" opacity="0.35"
                              textAnchor="middle">
                            {f.month_label.split(" ")[1]}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}