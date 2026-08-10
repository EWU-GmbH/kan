const TRAILING_SLASHES_REGEX = /\/+$/

export function isCrikketIntegrationEnabled(): boolean {
  const baseUrl = process.env.CRIKKET_BASE_URL?.trim()
  const apiKey = process.env.CRIKKET_API_KEY?.trim()
  return Boolean(baseUrl && apiKey)
}

function getCrikketConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.CRIKKET_BASE_URL?.trim()?.replace(
    TRAILING_SLASHES_REGEX,
    "",
  )
  const apiKey = process.env.CRIKKET_API_KEY?.trim()

  if (!(baseUrl && apiKey)) {
    return null
  }

  return { baseUrl, apiKey }
}

export type CrikketFeatureRequestLookup = {
  featureRequestId: string
  title: string
  hasReporterEmail: boolean
  reporterEmail: string | null
  status: string
}

export async function getCrikketFeatureRequestByKanCard(
  cardPublicId: string,
): Promise<CrikketFeatureRequestLookup | null> {
  const config = getCrikketConfig()
  if (!config) {
    return null
  }

  const response = await fetch(
    `${config.baseUrl}/api/kan/feature-requests/by-card/${encodeURIComponent(cardPublicId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `Crikket feature request lookup failed (${response.status}): ${body.slice(0, 500)}`,
    )
  }

  const data = (await response.json()) as {
    ok?: boolean
    featureRequestId?: string
    title?: string
    hasReporterEmail?: boolean
    reporterEmail?: string | null
    status?: string
  }

  if (
    !data.ok ||
    !data.featureRequestId ||
    typeof data.title !== "string" ||
    typeof data.hasReporterEmail !== "boolean" ||
    typeof data.status !== "string"
  ) {
    throw new Error("Crikket feature request lookup returned invalid payload")
  }

  return {
    featureRequestId: data.featureRequestId,
    title: data.title,
    hasReporterEmail: data.hasReporterEmail,
    reporterEmail: data.reporterEmail ?? null,
    status: data.status,
  }
}

export async function sendCrikketFeatureRequestReporterFollowUp(input: {
  cardPublicId: string
  message: string
}): Promise<void> {
  const config = getCrikketConfig()
  if (!config) {
    throw new Error("Crikket integration is not configured")
  }

  const response = await fetch(
    `${config.baseUrl}/api/kan/feature-requests/by-card/${encodeURIComponent(input.cardPublicId)}/reporter-follow-up`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: input.message }),
    },
  )

  if (!response.ok) {
    let message = `Crikket reporter follow-up failed (${response.status})`
    try {
      const data = (await response.json()) as { message?: string }
      if (data.message) {
        message = data.message
      }
    } catch {
      const body = await response.text().catch(() => "")
      if (body) {
        message = body.slice(0, 500)
      }
    }

    throw new Error(message)
  }
}
