export function riskColor(level: string): string {
  return { Critical: "#B71C1C", Severe: "#a53a00", Moderate: "#f59700", Normal: "#2E7D32" }[level] ?? "#2E7D32"
}

export function riskBg(level: string): string {
  return { Critical: "#ffffff", Severe: "#ffffff", Moderate: "#ffffff", Normal: "#ffffff" }[level] ?? "#ffffff"
}