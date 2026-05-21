"use client"
import { useState } from "react"
import Header          from "@/components/dashboard/Header"
import DashboardClient from "@/components/dashboard/DashboardClient"

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <>
      <Header
        activePage="dashboard"
        onOpenAlertSidebar={() => setSidebarOpen(true)}
      />
      <DashboardClient
        externalSidebarOpen={sidebarOpen}
        onExternalSidebarClose={() => setSidebarOpen(false)}
      />
    </>
  )
}