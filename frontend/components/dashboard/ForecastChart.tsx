import { riskColor } from "@/lib/hooks/useColor"
import { ForecastData } from "@/lib/types"

export function ForecastChart({ data }: { data: ForecastData }) {
  const maxPrice = Math.max(...data.forecast.map(f => f.upper_bound)) * 1.15
  const baseline = data.baseline_price
  const n        = data.forecast.length
  const W        = 560
  const H        = 220
  const PAD_L    = 55
  const PAD_B    = 30
  const PAD_T    = 20
  const chartW   = W - PAD_L - 20
  const chartH   = H - PAD_B - PAD_T
  const barW     = Math.min(60, (chartW / n) * 0.55)
  const gap      = (chartW - n * barW) / (n + 1)

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
                  stroke="#0f0f0f" strokeWidth="1"/>
            <text x={PAD_L - 4} y={y + 4} fontSize="10"
                  fill="#1b1d1f" textAnchor="end">
              {price >= 1000 ? `${(price/1000).toFixed(1)}k` : price}
            </text>
          </g>
        )
      })}

      {/* Baseline line */}
      <line x1={PAD_L} y1={toY(baseline)} x2={W - 20} y2={toY(baseline)}
            stroke="#F5C842" strokeWidth="1.5" strokeDasharray="5,3"/>
      <text x={PAD_L + 4} y={toY(baseline) - 4} fontSize="9" fill="#F5C842">
        baseline {baseline.toLocaleString()} MWK
      </text>

      {/* Bars */}
      {data.forecast.map((f, i) => {
        const x      = PAD_L + gap + i * (barW + gap)
        const yBar   = toY(f.forecast)
        const yLow   = toY(f.lower_bound)
        const yHigh  = toY(f.upper_bound)
        const barH   = H - PAD_B - yBar
        const color  = riskColor(f.risk_level)

        return (
          <g key={i}>
            {/* Confidence band */}
            <rect x={x + barW * 0.1} y={yHigh}
                  width={barW * 0.8} height={Math.abs(yLow - yHigh)}
                  fill={color} opacity="0.1" rx="3"/>

            {/* Bar */}
            <rect x={x} y={yBar} width={barW} height={barH}
                  fill={color} opacity="0.85" rx="4"/>

            {/* Price label */}
            <text x={x + barW / 2} y={yBar - 6}
                  fontSize="16" fill={color} textAnchor="middle" fontWeight="700">
              {f.forecast >= 1000
                ? `${(f.forecast/1000).toFixed(1)}k`
                : f.forecast}
            </text>

            {/* Month label */}
            <text x={x + barW / 2} y={H - 2}
                  fontSize="15" fill="#000000" textAnchor="middle">
              {f.month_label.split(" ")[0]}
            </text>

            {/* Season label */}
            <text x={x + barW / 2} y={H - 18}
                  fontSize="10" fill="#0f0f0f" textAnchor="middle">
              {f.season.split(" ")[0]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}