import type { Metadata } from "next"
import "./globals.css"
import Script from "next/script"
import { ThemeProvider } from "@/components/ThemeProvider"
import DataStaleBanner from "@/components/dashboard/DataStaleBanner";

export const metadata: Metadata = {
    title      : "Malawi Food Security Monitor",
    description: "Real-time food price spike detection across 28 districts",
}

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
        <body className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100
                       antialiased h-screen flex flex-col overflow-hidden">
        <Script id="theme-init" strategy="beforeInteractive">{`
          (function() {
            try {
              const t = localStorage.getItem('mfs-theme') || 'light';
              document.documentElement.classList.toggle('dark', t === 'dark');
            } catch(e) {}
          })()
        `}</Script>
        <DataStaleBanner />
        <ThemeProvider>
            {children}
        </ThemeProvider>
        </body>
        </html>
    )
}