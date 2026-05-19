import assert from "node:assert/strict"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { CodeFile, Framer } from "framer-api"
import type { ServerConfig } from "../lib/config.js"
import type { FramerProvider } from "../lib/framerConnection.js"
import { createFramerMcpServer } from "../lib/server.js"

const config: ServerConfig = {
  projectUrl: "https://framer.com/projects/Test--abcdefghijklmnopqrst",
  apiKey: "test-key",
  clientId: "test-client",
  maxContentBytes: 500_000,
}

test("MCP server exposes tools, resources, prompts, and basic fake Framer calls", async () => {
  const framer = createFakeFramer()
  const provider: FramerProvider = {
    withFramer: operation => operation(framer),
  }
  const server = createFramerMcpServer(provider, config)
  const client = new Client({ name: "test-client", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  try {
    const tools = await client.listTools()
    const toolNames = tools.tools.map(tool => tool.name)
    assert.ok(toolNames.includes("framer_get_code_file"))
    assert.ok(toolNames.includes("framer_agent_apply_changes"))
    assert.ok(toolNames.includes("framer_agent_deploy_production"))

    const resources = await client.listResources()
    const resourceUris = resources.resources.map(resource => resource.uri)
    assert.ok(resourceUris.includes("framer://project/info"))
    assert.ok(resourceUris.includes("framer://code-files"))
    assert.ok(resourceUris.includes("framer://code-file/code-1"))

    const prompts = await client.listPrompts()
    const promptNames = prompts.prompts.map(prompt => prompt.name)
    assert.ok(promptNames.includes("write-framer-override"))
    assert.ok(promptNames.includes("edit-framer-page-with-agent-dsl"))

    const projectResult = await client.callTool({
      name: "framer_project_info",
      arguments: {},
    })
    assert.equal(projectResult.isError, undefined)
    assert.equal((projectResult.structuredContent?.project as { name?: string }).name, "Fake Project")

    const codeResult = await client.callTool({
      name: "framer_list_code_files",
      arguments: { includeContent: true },
    })
    assert.equal(codeResult.isError, undefined)
    assert.equal(((codeResult.structuredContent?.files as Array<{ name: string }>)[0]?.name), "Overrides.tsx")

    const projectResource = await client.readResource({ uri: "framer://project/info" })
    const projectPayload = JSON.parse(projectResource.contents[0]?.text ?? "{}") as { project?: { name?: string } }
    assert.equal(projectPayload.project?.name, "Fake Project")
  } finally {
    await client.close()
    await server.close()
  }
})

function createFakeFramer(): Framer {
  const codeFile = {
    id: "code-1",
    name: "Overrides.tsx",
    path: "Overrides.tsx",
    content: 'import { forwardRef, type ComponentType } from "react"\nexport function withFoo(Component): ComponentType { return forwardRef((props, ref) => <Component ref={ref} {...props} />) }\n',
    exports: [{ type: "override", name: "withFoo", isDefaultExport: false }],
    versionId: "version-1",
    setFileContent: async () => codeFile,
    rename: async (newName: string) => ({ ...codeFile, name: newName }),
    remove: async () => undefined,
    getVersions: async () => [
      {
        id: "version-1",
        name: "Overrides.tsx",
        createdAt: "2026-05-19T00:00:00.000Z",
        createdBy: {
          id: "user-1",
          apiVersion1Id: "legacy-user-1",
          name: "Tester",
          initials: "T",
        },
        getContent: async () => codeFile.content,
      },
    ],
  } as unknown as CodeFile

  return {
    mode: "canvas",
    requestId: "request-1",
    sessionId: "session-1",
    disconnect: async () => undefined,
    reconnect: async () => undefined,
    getProjectInfo: async () => ({
      id: "project-1",
      apiVersion1Id: "legacy-project-1",
      name: "Fake Project",
    }),
    getPublishInfo: async () => ({
      production: null,
      staging: null,
    }),
    getCodeFiles: async () => [codeFile],
    getCodeFile: async (id: string) => (id === codeFile.id ? codeFile : null),
    typecheckCode: async () => [],
    createCodeFile: async () => codeFile,
    getNodesWithType: async () => [],
    getNode: async () => null,
    getParent: async () => null,
    getChildren: async () => [],
    getColorStyles: async () => [],
    getTextStyles: async () => [],
    getFonts: async () => [],
    getAgentSystemPrompt: async () => "agent system prompt",
    getAgentContext: async () => "agent context",
    readProjectForAgent: async queries => ({ results: queries.map(() => ({ ok: true })) }),
    serializeForAgent: async input => ({ id: input.id }),
    serializeNodesForAgent: async input => input.ids.map(id => ({ id })),
    queryImagesForAgent: async input => ({ input, results: [] }),
    applyAgentChanges: async () => undefined,
    reviewChangesForAgent: async () => ({ ok: true }),
    flattenComponentInstanceForAgent: async input => ({ success: true, replacementId: input.id }),
    makeExternalComponentLocalForAgent: async input => ({ success: true, id: input.id }),
    publishForAgent: async input => ({ input, status: "ok" }),
  } as unknown as Framer
}
