import "dotenv/config"
import { connect } from "framer-api"

const projectUrl = process.env.FRAMER_PROJECT_URL
const apiKey = process.env.FRAMER_API_KEY

if (!projectUrl || !apiKey) {
  console.log("Skipping live smoke: set FRAMER_PROJECT_URL and FRAMER_API_KEY to run against a real Framer project.")
  process.exit(0)
}

const framer = await connect(projectUrl, apiKey, {
  clientId: process.env.FRAMER_CLIENT_ID || "framer-mcp-server/live-smoke",
})

try {
  const project = await framer.getProjectInfo()
  const codeFiles = await framer.getCodeFiles()
  const diagnostics = await framer.typecheckCode(
    "SmokeOverride.tsx",
    'import type { ComponentType } from "react"\nexport function withSmoke(Component: ComponentType): ComponentType { return Component }\n',
  )
  const context = await framer.getAgentContext().catch(error => `agent context unavailable: ${error instanceof Error ? error.message : String(error)}`)

  console.log(
    JSON.stringify(
      {
        project: { id: project.id, name: project.name },
        codeFileCount: codeFiles.length,
        smokeDiagnosticCount: diagnostics.length,
        diagnostics,
        agentContextBytes: Buffer.byteLength(context, "utf8"),
      },
      null,
      2,
    ),
  )

  if (diagnostics.length > 0) process.exitCode = 1
} finally {
  await framer.disconnect()
}
