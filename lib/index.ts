import "dotenv/config"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { loadConfig } from "./config.js"
import { FramerConnection } from "./framerConnection.js"
import { createFramerMcpServer } from "./server.js"

const config = loadConfig()
const connection = new FramerConnection(config)

const server = createFramerMcpServer(connection, config)

const transport = new StdioServerTransport()
await server.connect(transport)

async function shutdown(): Promise<void> {
  await connection.disconnect()
  await server.close()
}

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0))
})

process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0))
})
