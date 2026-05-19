export interface ServerConfig {
  projectUrl: string
  apiKey: string
  clientId: string
  maxContentBytes: number
}

const DEFAULT_MAX_CONTENT_BYTES = 500_000

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function optionalPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    projectUrl: requiredEnv(env, "FRAMER_PROJECT_URL"),
    apiKey: requiredEnv(env, "FRAMER_API_KEY"),
    clientId: env.FRAMER_CLIENT_ID?.trim() || "framer-mcp-server/1.0.0",
    maxContentBytes: optionalPositiveInteger(env.FRAMER_MCP_MAX_CONTENT_BYTES, DEFAULT_MAX_CONTENT_BYTES),
  }
}

export function redactSecrets(text: string, config?: Pick<ServerConfig, "apiKey">): string {
  let redacted = text
  const knownSecrets = [config?.apiKey, process.env.FRAMER_API_KEY].filter(Boolean)

  for (const secret of knownSecrets) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]")
  }

  return redacted
    .replace(/Authorization:\s*Token\s+[A-Za-z0-9._-]+/giu, "Authorization: Token [REDACTED]")
    .replace(/Token\s+[A-Za-z0-9._-]+/giu, "Token [REDACTED]")
}
