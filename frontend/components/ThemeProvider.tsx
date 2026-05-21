"use client"
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light"

const ThemeContext = createContext<{
  theme  : Theme
  toggle : () => void
}>({ theme: "dark", toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark")

  // On mount — read saved preference
  useEffect(() => {
    const saved = localStorage.getItem("mfs-theme") as Theme | null
    const preferred = saved ?? "dark"
    setTheme(preferred)
    document.documentElement.classList.toggle("dark", preferred === "dark")
  }, [])

  function toggle() {
    const current = document.documentElement.classList.contains("dark") ? "dark" : "light"
    const next = current === "light" ? "dark" : "light"
    localStorage.setItem("mfs-theme", next)
    document.documentElement.classList.toggle("dark", next === "dark")
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
