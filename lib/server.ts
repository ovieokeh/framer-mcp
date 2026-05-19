import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ServerConfig } from "./config.js"
import type { FramerProvider } from "./framerConnection.js"
import { registerPrompts } from "./prompts.js"
import { registerAgentTools } from "./tools/agent.js"
import { registerCodeTools } from "./tools/code.js"
import { registerContextResources, registerContextTools } from "./tools/context.js"
import { registerPublishTools } from "./tools/publish.js"

export function createFramerMcpServer(connection: FramerProvider, config: ServerConfig): McpServer {
  const server = new McpServer(
    {
      name: "framer-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Use this server to work with Framer projects. Prefer broad read/context tools before editing. Direct code writes require expectedVersionId. Agent DSL mutation tools require confirm=true, pagePath, and intent. Never ask this server to reveal API keys.",
    },
  )

  registerCodeTools(server, connection, config)
  registerContextTools(server, connection, config)
  registerContextResources(server, connection, config)
  registerAgentTools(server, connection, config)
  registerPublishTools(server, connection)
  registerPrompts(server)

  return server
}
