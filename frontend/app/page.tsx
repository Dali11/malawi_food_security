import Header          from "@/components/dashboard/Header"
import DashboardClient from "@/components/dashboard/DashboardClient"

export default function HomePage() {
  return (
    <>
      <Header activePage="dashboard" />
      <DashboardClient />
    </>
  )
}