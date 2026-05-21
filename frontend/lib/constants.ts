

//______________API______________
export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const DISTRICTS = [
  "Balaka", "Blantyre", "Chikwawa", "Chiradzulu", "Chitipa",
  "Dedza", "Dowa", "Karonga", "Kasungu", "Likoma",
  "Lilongwe", "Machinga", "Mangochi", "Mchinji", "Mulanje",
  "Mwanza", "Mzimba", "Neno", "Nkhata Bay", "Nkhotakota",
  "Nsanje", "Ntcheu", "Ntchisi", "Phalombe", "Rumphi",
  "Salima", "Thyolo", "Zomba",
];

export const BASEMAPS = [
  // { name: "Default",          urlDark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",  urlLight: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attr: "CARTO"         },
  { name: "OpenStreetMap", urlDark: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",             urlLight: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",            attr: "OpenStreetMap" },
  { name: "Satellite",     urlDark: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", urlLight: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Esri" },
]


//___________fORECAST_______________
export const FORECAST_COMMODITIES = [
  "Maize", "Beans", "Cowpeas", "Rice", "Sugar", "Pigeon peas"
]

//______Legends___________
export const LEGEND = [
  { label: "Critical", color: "#B71C1C" },
  { label: "High",     color: "#EF5350" },
  { label: "Moderate", color: "#FFAB40" },
  { label: "Low",      color: "#FFE082" },
  { label: "Stable",   color: "#A5D6A7" },
]