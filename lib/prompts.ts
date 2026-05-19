import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "write-framer-override",
    {
      title: "Write Framer Override",
      description: "Plan and implement a Framer Code Override with project context, typechecking, preview, and guarded apply.",
      argsSchema: {
        goal: z.string(),
        pagePath: z.string().optional(),
        targetNodeId: z.string().optional(),
        codeFileIdOrName: z.string().optional(),
      },
    },
    args => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Goal: ${args.goal}`,
              args.pagePath ? `Page path: ${args.pagePath}` : null,
              args.targetNodeId ? `Target node id: ${args.targetNodeId}` : null,
              args.codeFileIdOrName ? `Preferred code file: ${args.codeFileIdOrName}` : null,
              "",
              "Use Framer MCP context before editing: read project info, code files, styles, and agent context.",
              "For Override code, preserve props, use React 18-compatible patterns, and use forwardRef when wrapping layers.",
              "Before writing, call framer_preview_code_file_update or framer_typecheck_code. Apply only with expectedVersionId.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    "debug-framer-override",
    {
      title: "Debug Framer Override",
      description: "Investigate why a Code Override is failing or behaving unexpectedly.",
      argsSchema: {
        symptom: z.string(),
        codeFileIdOrName: z.string().optional(),
        targetNodeId: z.string().optional(),
        pagePath: z.string().optional(),
      },
    },
    args => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Symptom: ${args.symptom}`,
              args.codeFileIdOrName ? `Code file: ${args.codeFileIdOrName}` : null,
              args.targetNodeId ? `Target node id: ${args.targetNodeId}` : null,
              args.pagePath ? `Page path: ${args.pagePath}` : null,
              "",
              "Read the code file, typecheck it, inspect target/page context, and look for Framer-specific Override issues: missing prop spread, missing ref forwarding, swallowed handlers, className replacement, or unsupported browser/runtime assumptions.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    "edit-framer-page-with-agent-dsl",
    {
      title: "Edit Framer Page With Agent DSL",
      description: "Use Framer's native agent DSL after reading its prompt/context and reviewing changes.",
      argsSchema: {
        goal: z.string(),
        pagePath: z.string(),
      },
    },
    args => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Goal: ${args.goal}`,
              `Page path: ${args.pagePath}`,
              "",
              "First call framer_agent_system_prompt and framer_agent_context. Use framer_agent_read_project or serialization tools to inspect relevant nodes. Apply changes only with framer_agent_apply_changes using confirm=true and a clear intent, then call framer_agent_review_changes.",
            ].join("\n"),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    "review-framer-code-or-dsl-changes",
    {
      title: "Review Framer Code Or DSL Changes",
      description: "Review proposed Framer code or native agent DSL changes before applying/publishing.",
      argsSchema: {
        changeSummary: z.string(),
        pagePath: z.string().optional(),
      },
    },
    args => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Change summary: ${args.changeSummary}`,
              args.pagePath ? `Page path: ${args.pagePath}` : null,
              "",
              "Review for behavioral risk, Framer-specific breakage, missing typechecks, stale version writes, destructive actions, and whether a safer first-class Framer feature could replace an Override.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  )
}
