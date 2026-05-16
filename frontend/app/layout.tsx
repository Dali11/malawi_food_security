import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Malawi Food Security Monitor",
  description: "WFP food price spike detection and district risk analysis",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`} style={{ background: "#050A12" }}
    >
      <body className="h-full  text-slate-100" style={{ background: "#0a0a0a" }}>
        {children}
      </body>
    </html>
  )
}
