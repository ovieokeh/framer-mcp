import assert from "node:assert/strict"
import test from "node:test"
import { loadConfig, redactSecrets } from "../lib/config.js"

test("loadConfig reads required credentials and defaults", () => {
  const config = loadConfig({
    FRAMER_PROJECT_URL: "https://framer.com/projects/Site--abcdefghijklmnopqrst",
    FRAMER_API_KEY: "secret-key",
  })

  assert.equal(config.apiKey, "secret-key")
  assert.equal(config.clientId, "framer-mcp-server/1.0.0")
  assert.equal(config.maxContentBytes, 500_000)
})

test("loadConfig rejects missing credentials", () => {
  assert.throws(() => loadConfig({ FRAMER_API_KEY: "secret-key" }), /FRAMER_PROJECT_URL/u)
})

test("redactSecrets removes known API keys", () => {
  assert.equal(redactSecrets("Token secret-key", { apiKey: "secret-key" }), "Token [REDACTED]")
})
