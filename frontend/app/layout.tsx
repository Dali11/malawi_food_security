import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/ThemeProvider"

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              const t = localStorage.getItem('mfs-theme') || 'dark';
              document.documentElement.classList.toggle('dark', t === 'dark');
            } catch(e) {}
          })()
        `}} />
      </head>
      <body className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100
                       antialiased h-screen flex flex-col overflow-hidden">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}