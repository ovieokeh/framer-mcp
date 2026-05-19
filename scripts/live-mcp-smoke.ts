import "dotenv/config"
import assert from "node:assert/strict"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { loadConfig } from "../lib/config.js"
import { FramerConnection } from "../lib/framerConnection.js"
import { createFramerMcpServer } from "../lib/server.js"

const config = loadConfig({
  ...process.env,
  FRAMER_CLIENT_ID: process.env.FRAMER_CLIENT_ID || "framer-mcp-server/live-mcp-smoke",
})
const connection = new FramerConnection(config)
const server = createFramerMcpServer(connection, config)
const client = new Client({ name: "framer-mcp-live-smoke", version: "1.0.0" })
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

const summary: Record<string, unknown> = {}

try {
  const tools = await client.listTools()
  const toolNames = tools.tools.map(tool => tool.name)
  for (const requiredTool of [
    "framer_project_info",
    "framer_list_code_files",
    "framer_agent_context",
    "framer_preview_code_file_update",
    "framer_agent_apply_changes",
  ]) {
    assert.ok(toolNames.includes(requiredTool), `Missing tool: ${requiredTool}`)
  }
  summary.toolCount = toolNames.length

  const resources = await client.listResources()
  const resourceUris = resources.resources.map(resource => resource.uri)
  assert.ok(resourceUris.includes("framer://project/info"), "Missing project info resource")
  assert.ok(resourceUris.includes("framer://code-files"), "Missing code files resource")
  summary.resourceCount = resourceUris.length

  const prompts = await client.listPrompts()
  const promptNames = prompts.prompts.map(prompt => prompt.name)
  assert.ok(promptNames.includes("write-framer-override"), "Missing write-framer-override prompt")
  summary.promptCount = promptNames.length

  const projectInfo = await callTool("framer_project_info", {})
  summary.project = projectInfo.structuredContent?.project

  const codeFiles = await callTool("framer_list_code_files", { includeContent: false })
  const files = codeFiles.structuredContent?.files as Array<{ id: string; name: string; versionId: string }> | undefined
  summary.codeFileCount = files?.length ?? 0

  const projectResource = await client.readResource({ uri: "framer://project/info" })
  assert.ok(textFromResource(projectResource).includes("project"), "Project resource did not include project payload")

  const codeFilesResource = await client.readResource({ uri: "framer://code-files" })
  assert.ok(textFromResource(codeFilesResource).includes("files"), "Code files resource did not include files payload")

  const agentContext = await callTool("framer_agent_context", {})
  const context = String(agentContext.structuredContent?.context ?? "")
  assert.ok(context.length > 0, "Agent context was empty")
  summary.agentContextBytes = Buffer.byteLength(context, "utf8")

  const prompt = await client.getPrompt({
    name: "write-framer-override",
    arguments: { goal: "Add a safe smoke-test override without applying it" },
  })
  assert.ok(prompt.messages.length > 0, "write-framer-override prompt returned no messages")

  if (process.env.FRAMER_MCP_LIVE_WRITE === "1") {
    summary.writeRoundTrip = await runWriteRoundTrip(files)
  } else {
    summary.writeRoundTrip = "skipped; set FRAMER_MCP_LIVE_WRITE=1 only on a copied/sandbox project"
  }

  console.log(JSON.stringify(summary, null, 2))
} finally {
  await client.close()
  await server.close()
  await connection.disconnect()
}

async function runWriteRoundTrip(existingFiles: Array<{ id: string; name: string; versionId: string }> | undefined): Promise<Record<string, unknown>> {
  const name = `McpSmoke_${Date.now()}.tsx`
  const initialContent = 'import type { ComponentType } from "react"\nexport function withMcpSmoke(Component: ComponentType): ComponentType { return Component }\n'
  const updatedContent = 'import type { ComponentType } from "react"\nexport function withMcpSmokeUpdated(Component: ComponentType): ComponentType { return Component }\n'

  if (existingFiles?.some(file => file.name === name)) {
    throw new Error(`Smoke file already exists: ${name}`)
  }

  const created = await callTool("framer_create_code_file", {
    name,
    content: initialContent,
  })
  const createdFile = created.structuredContent?.file as { id: string; name: string; versionId: string } | undefined
  assert.ok(createdFile?.id, "Create did not return a code file id")

  let latestFile = createdFile

  try {
    const preview = await callTool("framer_preview_code_file_update", {
      idOrName: latestFile.id,
      newContent: updatedContent,
    })
    assert.equal(preview.structuredContent?.changed, true, "Preview did not report a change")

    const updated = await callTool("framer_apply_code_file_update", {
      idOrName: latestFile.id,
      newContent: updatedContent,
      expectedVersionId: latestFile.versionId,
    })
    latestFile = updated.structuredContent?.file as { id: string; name: string; versionId: string }
    assert.ok(latestFile.versionId, "Update did not return a new version id")

    return {
      created: true,
      updated: true,
      removed: await removeSmokeFile(latestFile),
      fileName: name,
    }
  } catch (error) {
    await removeSmokeFile(latestFile).catch(() => false)
    throw error
  }
}

async function removeSmokeFile(file: { id: string; name: string; versionId: string }): Promise<boolean> {
  await callTool("framer_remove_code_file", {
    idOrName: file.id,
    expectedVersionId: file.versionId,
    confirmName: file.name,
  })
  return true
}

async function callTool(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args })
  if (result.isError) {
    throw new Error(`Tool ${name} failed: ${textFromToolResult(result)}`)
  }

  return result
}

function textFromToolResult(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return result.content
    .map(item => ("text" in item && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n")
}

function textFromResource(result: Awaited<ReturnType<Client["readResource"]>>): string {
  return result.contents
    .map(item => ("text" in item && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n")
}
