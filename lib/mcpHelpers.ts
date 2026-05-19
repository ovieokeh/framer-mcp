import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import { errorDetails, errorMessage } from "./errors.js"
import { fail } from "./output.js"

type ToolConfig = {
  title?: string
  description?: string
  inputSchema?: unknown
  outputSchema?: unknown
  annotations?: ToolAnnotations
  _meta?: Record<string, unknown>
}

export function registerSafeTool<Args extends Record<string, unknown> = Record<string, never>>(
  server: McpServer,
  name: string,
  config: ToolConfig,
  handler: (args: Args) => Promise<CallToolResult> | CallToolResult,
): void {
  server.registerTool(name, config as never, async (args: unknown) => {
    try {
      return await handler((args ?? {}) as Args)
    } catch (error) {
      return fail(errorMessage(error), errorDetails(error))
    }
  })
}

export const readOnly = {
  readOnlyHint: true,
} satisfies ToolAnnotations

export const guardedWrite = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
} satisfies ToolAnnotations

export const destructiveWrite = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
} satisfies ToolAnnotations
