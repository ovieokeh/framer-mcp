import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FramerProvider } from "../framerConnection.js"
import { guardedWrite, registerSafeTool } from "../mcpHelpers.js"
import { fail, ok } from "../output.js"
import { sanitizeFramerValue } from "../serializers.js"

const extraInputSchema = z.record(z.string(), z.unknown()).optional()

export function registerPublishTools(server: McpServer, connection: FramerProvider): void {
  registerSafeTool(
    server,
    "framer_agent_publish_preview",
    {
      title: "Publish Framer preview",
      description: "Run Framer's native agent publish preview action. Additional input is merged into { action: 'preview' }.",
      inputSchema: {
        input: extraInputSchema,
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          result: sanitizeFramerValue(
            await framer.publishForAgent({
              action: "preview",
              ...extraInput(args.input),
            }),
          ),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_agent_publish_confirm",
    {
      title: "Confirm Framer publish",
      description: "Run Framer's native agent confirm_publish action. Requires confirm=true.",
      inputSchema: {
        confirm: z.literal(true),
        deploymentId: z.string().optional(),
        input: extraInputSchema,
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer =>
        ok({
          result: sanitizeFramerValue(
            await framer.publishForAgent({
              action: "confirm_publish",
              ...(args.deploymentId ? { deploymentId: args.deploymentId } : {}),
              ...extraInput(args.input),
            }),
          ),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_agent_deploy_production",
    {
      title: "Deploy Framer production",
      description: "Promote a previous preview/publish result to production. Requires deploymentId and confirmProduction=true.",
      inputSchema: {
        deploymentId: z.string().min(1),
        domains: z.array(z.string().min(1)).optional(),
        confirmProduction: z.literal(true),
        input: extraInputSchema,
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer => {
        if (!args.deploymentId) return fail("deploymentId is required for production deploy.")

        return ok({
          result: sanitizeFramerValue(
            await framer.publishForAgent({
              action: "deploy_to_production",
              deploymentId: args.deploymentId,
              ...(args.domains ? { domains: args.domains } : {}),
              ...extraInput(args.input),
            }),
          ),
        })
      }),
  )
}

function extraInput(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
}
