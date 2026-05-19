"use client"
import { useState, useEffect } from "react"

type Breakpoint = "mobile" | "tablet" | "desktop"

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("desktop")

  useEffect(() => {
    function update() {
      const w = window.innerWidth
      if (w < 768)  setBp("mobile")
      else if (w < 1024) setBp("tablet")
      else setBp("desktop")
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return bp
}
