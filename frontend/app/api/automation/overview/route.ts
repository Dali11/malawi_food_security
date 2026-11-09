import type { AutomationOverview } from "@/lib/automation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const apiBase = process.env.AUTOMATION_API_BASE_URL
  const apiHost = process.env.AUTOMATION_API_HOST
  const token = process.env.AUTOMATION_API_TOKEN

  if (!apiBase || !apiHost || !token || token.length < 32) {
    return Response.json(
      { error: "Automation monitoring is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    Host: apiHost,
  })

  try {
    const upstream = await fetch(`${apiBase.replace(/\/$/, "")}/api/automation/overview`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    if (!upstream.ok) {
      return Response.json(
        { error: "Automation status is temporarily unavailable." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      )
    }
    const data = (await upstream.json()) as AutomationOverview
    return Response.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json(
      { error: "Automation status is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }
}
