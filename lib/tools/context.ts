import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { ServerConfig } from "../config.js"
import type { FramerProvider } from "../framerConnection.js"
import { readOnly, registerSafeTool } from "../mcpHelpers.js"
import { fail, ok, resourceJson, resourceText } from "../output.js"
import { serializeCodeFile, serializeColorStyle, serializeNode, serializeProjectInfo, serializeTextStyle, sanitizeFramerValue } from "../serializers.js"
import { OVERRIDES_GUIDE } from "../docs/overridesGuide.js"
import { limitString } from "../limits.js"

export function registerContextTools(server: McpServer, connection: FramerProvider, config: ServerConfig): void {
  registerSafeTool(
    server,
    "framer_project_info",
    {
      title: "Framer project info",
      description: "Get Framer project metadata and the current server API mode.",
      annotations: readOnly,
    },
    async () =>
      connection.withFramer(async framer => {
        const projectInfo = await framer.getProjectInfo()
        return ok({
          project: serializeProjectInfo(projectInfo),
          mode: framer.mode,
          requestId: framer.requestId,
          sessionId: framer.sessionId,
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_get_publish_info",
    {
      title: "Framer publish info",
      description: "Read staging and production publish metadata.",
      annotations: readOnly,
    },
    async () =>
      connection.withFramer(async framer =>
        ok({
          publishInfo: sanitizeFramerValue(await framer.getPublishInfo()),
        }),
      ),
  )

  registerSafeTool(
    server,
    "framer_list_pages_and_components",
    {
      title: "List pages and components",
      description: "List top-level web pages, design pages, components, and code files for navigation context.",
      annotations: readOnly,
    },
    async () =>
      connection.withFramer(async framer => {
        const [webPages, designPages, components, codeFiles] = await Promise.all([
          framer.getNodesWithType("WebPageNode"),
          framer.getNodesWithType("DesignPageNode"),
          framer.getNodesWithType("ComponentNode"),
          framer.getCodeFiles(),
        ])

        return ok({
          webPages: webPages.map(node => serializeNode(node, 2)),
          designPages: designPages.map(node => serializeNode(node, 2)),
          components: components.map(node => serializeNode(node, 2)),
          codeFiles: codeFiles.map(file =>
            serializeCodeFile(file, {
              includeContent: false,
              maxContentBytes: config.maxContentBytes,
            }),
          ),
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_get_node_context",
    {
      title: "Get node context",
      description: "Read a node plus optional parent and children context.",
      inputSchema: {
        nodeId: z.string().min(1),
        includeParent: z.boolean().optional(),
        includeChildren: z.boolean().optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const node = await framer.getNode(args.nodeId)
        if (!node) return fail(`Node ${args.nodeId} was not found.`)

        const [parent, children] = await Promise.all([
          args.includeParent ? framer.getParent(args.nodeId) : Promise.resolve(null),
          args.includeChildren ? framer.getChildren(args.nodeId) : Promise.resolve([]),
        ])

        return ok({
          node: serializeNode(node, 3),
          parent: parent ? serializeNode(parent, 2) : null,
          children: children.map(child => serializeNode(child, 2)),
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_get_selection_context",
    {
      title: "Get selection context",
      description: "Read current selection context when the Server API exposes selection access.",
      annotations: readOnly,
    },
    async () =>
      connection.withFramer(async framer => {
        const maybeGetSelection = (framer as unknown as { getSelection?: () => Promise<unknown[]> }).getSelection
        if (!maybeGetSelection) {
          return fail("The installed framer-api Server API does not expose getSelection. Use framer_get_node_context or Framer agent context instead.")
        }

        const selection = await maybeGetSelection.call(framer)
        return ok({
          selection: selection.map(node => sanitizeFramerValue(node, 3)),
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_get_styles_context",
    {
      title: "Get styles context",
      description: "Read color styles, text styles, and optionally fonts for design-aware code/agent work.",
      inputSchema: {
        includeFonts: z.boolean().optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const [colorStyles, textStyles, fonts] = await Promise.all([
          framer.getColorStyles(),
          framer.getTextStyles(),
          args.includeFonts ? framer.getFonts() : Promise.resolve([]),
        ])

        return ok({
          colorStyles: colorStyles.map(serializeColorStyle),
          textStyles: textStyles.map(serializeTextStyle),
          fonts: fonts.map(font => sanitizeFramerValue(font, 2)),
        })
      }),
  )
}

export function registerContextResources(server: McpServer, connection: FramerProvider, config: ServerConfig): void {
  server.registerResource(
    "project-info",
    "framer://project/info",
    {
      title: "Framer Project Info",
      description: "Framer project metadata.",
      mimeType: "application/json",
    },
    async uri =>
      connection.withFramer(async framer => {
        const projectInfo = await framer.getProjectInfo()
        return resourceJson(uri.href, {
          project: serializeProjectInfo(projectInfo),
          mode: framer.mode,
        })
      }),
  )

  server.registerResource(
    "code-files",
    "framer://code-files",
    {
      title: "Framer Code Files",
      description: "All Framer code files without content.",
      mimeType: "application/json",
    },
    async uri =>
      connection.withFramer(async framer =>
        resourceJson(uri.href, {
          files: (await framer.getCodeFiles()).map(file =>
            serializeCodeFile(file, {
              includeContent: false,
              maxContentBytes: config.maxContentBytes,
            }),
          ),
        }),
      ),
  )

  server.registerResource(
    "code-file",
    new ResourceTemplate("framer://code-file/{id}", {
      list: async () =>
        connection.withFramer(async framer => ({
          resources: (await framer.getCodeFiles()).map(file => ({
            uri: `framer://code-file/${encodeURIComponent(file.id)}`,
            name: file.name,
            title: file.name,
            mimeType: "application/json",
          })),
        })),
    }),
    {
      title: "Framer Code File",
      description: "A Framer code file by id.",
      mimeType: "application/json",
    },
    async (uri, variables) =>
      connection.withFramer(async framer => {
        const id = String(variables.id)
        const file = await framer.getCodeFile(id)
        if (!file) return resourceJson(uri.href, { error: `Code file ${id} was not found.` })

        return resourceJson(uri.href, {
          file: serializeCodeFile(file, {
            includeContent: true,
            maxContentBytes: config.maxContentBytes,
          }),
        })
      }),
  )

  server.registerResource(
    "agent-context",
    new ResourceTemplate("framer://agent/context/{pagePath}", {
      list: undefined,
    }),
    {
      title: "Framer Agent Context",
      description: "Project/page-specific Framer agent context. Encode page paths, e.g. framer://agent/context/%2Fabout.",
      mimeType: "text/plain",
    },
    async (uri, variables) =>
      connection.withFramer(async framer => {
        const pagePath = decodeURIComponent(String(variables.pagePath))
        const text = await framer.getAgentContext({ pagePath })
        const limited = limitString(text, config.maxContentBytes)
        return resourceText(uri.href, limited.value)
      }),
  )

  server.registerResource(
    "overrides-guide",
    "framer://docs/overrides",
    {
      title: "Framer Overrides Guide",
      description: "Concise Framer Override implementation guidance for agents.",
      mimeType: "text/markdown",
    },
    uri => resourceText(uri.href, OVERRIDES_GUIDE, "text/markdown"),
  )
}
