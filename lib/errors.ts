import type { ServerConfig } from "./config.js"
import { redactSecrets } from "./config.js"

export function errorMessage(error: unknown, config?: Pick<ServerConfig, "apiKey">): string {
  const message = error instanceof Error ? error.message : String(error)
  return redactSecrets(message, config)
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) }

  const details: Record<string, unknown> = {
    name: error.name,
  }

  const maybeCode = (error as { code?: unknown }).code
  if (typeof maybeCode === "string") details.code = maybeCode

  return details
}
