import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { ServerConfig } from "../config.js"
import type { FramerProvider } from "../framerConnection.js"
import { limitString } from "../limits.js"
import { guardedWrite, readOnly, registerSafeTool } from "../mcpHelpers.js"
import { fail, ok, textResult } from "../output.js"
import { sanitizeFramerValue } from "../serializers.js"

const recordSchema = z.record(z.string(), z.unknown())

export function registerAgentTools(server: McpServer, connection: FramerProvider, config: ServerConfig): void {
  registerSafeTool(
    server,
    "framer_agent_system_prompt",
    {
      title: "Framer agent system prompt",
      description: "Read Framer's native static agent command/query documentation.",
      annotations: readOnly,
    },
    async () =>
      connection.withFramer(async framer => {
        const prompt = await framer.getAgentSystemPrompt()
        return limitedTextResult("prompt", prompt, config.maxContentBytes)
      }),
  )

  registerSafeTool(
    server,
    "framer_agent_context",
    {
      title: "Framer agent context",
      description: "Read Framer's native project/page context including components, tokens, styles, fonts, and icon sets.",
      inputSchema: {
        pagePath: z.string().optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const context = await framer.getAgentContext(args.pagePath ? { pagePath: args.pagePath } : undefined)
        return limitedTextResult("context", context, config.maxContentBytes, {
          pagePath: args.pagePath ?? null,
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_agent_read_project",
    {
      title: "Framer agent read project",
      description: "Execute Framer native agent read queries. Query syntax is documented by framer_agent_system_prompt.",
      inputSchema: {
        queries: z.array(recordSchema),
        pagePath: z.string().optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          result: sanitizeFramerValue(
            await framer.readProjectForAgent(args.queries, args.pagePath ? { pagePath: args.pagePath } : undefined),
          ),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_agent_serialize_node",
    {
      title: "Framer agent serialize node",
      description: "Serialize one node through Framer's native agent serializer.",
      inputSchema: {
        id: z.string().min(1),
        depth: z.number().int().nonnegative().optional(),
        attributeFilter: z.array(z.string()).optional(),
        ancestorPath: z.boolean().optional(),
        pagePath: z.string().optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          node: sanitizeFramerValue(
            await framer.serializeForAgent(
              {
                id: args.id,
                depth: args.depth,
                attributeFilter: args.attributeFilter,
                ancestorPath: args.ancestorPath,
              },
              args.pagePath ? { pagePath: args.pagePath } : undefined,
            ),
          ),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_agent_serialize_nodes",
    {
      title: "Framer agent serialize nodes",
      description: "Serialize multiple nodes through Framer's native agent serializer.",
      inputSchema: {
        ids: z.array(z.string().min(1)).min(1),
        depth: z.number().int().nonnegative().optional(),
        attributeFilter: z.array(z.string()).optional(),
        ancestorPath: z.boolean().optional(),
        pagePath: z.string().optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          nodes: sanitizeFramerValue(
            await framer.serializeNodesForAgent(
              {
                ids: args.ids,
                depth: args.depth,
                attributeFilter: args.attributeFilter,
                ancestorPath: args.ancestorPath,
              },
              args.pagePath ? { pagePath: args.pagePath } : undefined,
            ),
          ),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_agent_query_images",
    {
      title: "Framer agent query images",
      description: "Search for stock images through Framer's trusted agent image query API.",
      inputSchema: {
        input: recordSchema,
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          result: sanitizeFramerValue(await framer.queryImagesForAgent(args.input)),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_agent_apply_changes",
    {
      title: "Framer agent apply changes",
      description: "Apply Framer native agent DSL commands to one page. Requires confirm=true, pagePath, and a human-readable intent.",
      inputSchema: {
        dsl: z.string().min(1),
        pagePath: z.string().min(1),
        intent: z.string().min(8),
        confirm: z.literal(true),
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer => {
        await framer.applyAgentChanges(args.dsl, { pagePath: args.pagePath })
        const review = await framer.reviewChangesForAgent({ pagePath: args.pagePath })
        return ok({
          applied: true,
          intent: args.intent,
          pagePath: args.pagePath,
          review: sanitizeFramerValue(review),
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_agent_review_changes",
    {
      title: "Framer agent review changes",
      description: "Review accumulated Framer native agent changes and diagnostics for the current session/page.",
      inputSchema: {
        pagePath: z.string().optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          review: sanitizeFramerValue(await framer.reviewChangesForAgent(args.pagePath ? { pagePath: args.pagePath } : undefined)),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_agent_flatten_component",
    {
      title: "Flatten component instance",
      description: "Flatten a local component instance into editable layers through Framer's agent API. Requires confirmation.",
      inputSchema: {
        id: z.string().min(1),
        pagePath: z.string().min(1),
        intent: z.string().min(8),
        confirm: z.literal(true),
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          intent: args.intent,
          pagePath: args.pagePath,
          result: sanitizeFramerValue(await framer.flattenComponentInstanceForAgent({ id: args.id }, { pagePath: args.pagePath })),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_agent_make_component_local",
    {
      title: "Make external component local",
      description: "Convert an external component instance into a local project component. Requires confirmation.",
      inputSchema: {
        id: z.string().min(1),
        replaceAll: z.boolean().optional(),
        pagePath: z.string().min(1),
        intent: z.string().min(8),
        confirm: z.literal(true),
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          intent: args.intent,
          pagePath: args.pagePath,
          result: sanitizeFramerValue(
            await framer.makeExternalComponentLocalForAgent(
              {
                id: args.id,
                replaceAll: args.replaceAll,
              },
              { pagePath: args.pagePath },
            ),
          ),
        }),
      ),
  )
}

function limitedTextResult(key: string, text: string, maxBytes: number, extra: Record<string, unknown> = {}) {
  const limited = limitString(text, maxBytes)
  return textResult(limited.value, {
    [key]: limited.value,
    [`${key}Truncated`]: limited.truncated,
    [`${key}Bytes`]: limited.originalBytes,
    returnedBytes: limited.returnedBytes,
    ...extra,
  })
}
