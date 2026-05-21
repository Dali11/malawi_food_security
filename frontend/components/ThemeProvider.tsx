"use client"
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "light" | "dark"

const ThemeContext = createContext<{
  theme  : Theme
  toggle : () => void
}>({ theme: "light", toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light")

  // On mount — read saved preference
  useEffect(() => {
    const saved = localStorage.getItem("mfs-theme") as Theme | null
    const preferred = saved ?? "light"
    setTheme(preferred)
    document.documentElement.classList.toggle("light", preferred === "light")
  }, [])

  function toggle() {
    const current = document.documentElement.classList.contains("light") ? "light" : "dark"
    const next = current === "light" ? "dark" : "light"
    localStorage.setItem("mfs-theme", next)
    document.documentElement.classList.toggle("light", next === "light")
    setTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
