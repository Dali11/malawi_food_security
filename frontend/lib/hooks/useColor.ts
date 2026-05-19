export function riskColor(level: string): string {
  return { Critical: "#B71C1C", Severe: "#a53a00", Moderate: "#f59700", Normal: "#2E7D32" }[level] ?? "#2E7D32"
}

export function riskBg(level: string): string {
  return { Critical: "#2c2c2c", Severe: "#1a1919", Moderate: "#302e2e", Normal: "#242424" }[level] ?? "#EAF3DE"
}