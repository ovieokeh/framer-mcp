import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CodeFile, Framer } from "framer-api"
import { z } from "zod"
import type { ServerConfig } from "../config.js"
import { detectSourceExports, duplicateNameError, filterCodeFilesByExportType, resolveCodeFile, versionGuardError, confirmNameError } from "../codeFiles.js"
import { createUnifiedDiff } from "../diff.js"
import type { FramerProvider } from "../framerConnection.js"
import { destructiveWrite, guardedWrite, readOnly, registerSafeTool } from "../mcpHelpers.js"
import { fail, ok } from "../output.js"
import { limitString } from "../limits.js"
import { serializeCodeFile, serializeCodeFileVersion, serializeDiagnostic } from "../serializers.js"

const exportTypeSchema = z.enum(["all", "component", "override"]).default("all")

export function registerCodeTools(server: McpServer, connection: FramerProvider, config: ServerConfig): void {
  registerSafeTool(
    server,
    "framer_list_code_files",
    {
      title: "List Framer code files",
      description: "List Framer code files and their component/override exports. Content is omitted unless requested.",
      inputSchema: {
        includeContent: z.boolean().optional(),
        exportType: exportTypeSchema.optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const files = filterCodeFilesByExportType(await framer.getCodeFiles(), args.exportType ?? "all")
        return ok({
          files: files.map(file =>
            serializeCodeFile(file, {
              includeContent: Boolean(args.includeContent),
              maxContentBytes: config.maxContentBytes,
            }),
          ),
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_get_code_file",
    {
      title: "Get Framer code file",
      description: "Fetch a Framer code file by id, name, or path, including capped source content.",
      inputSchema: {
        idOrName: z.string().min(1),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const resolved = await getCodeFile(framer, args.idOrName)
        if (!resolved.file) return unresolvedFileResult(args.idOrName, resolved.matches)

        return ok({
          file: serializeCodeFile(resolved.file, {
            includeContent: true,
            maxContentBytes: config.maxContentBytes,
          }),
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_typecheck_code",
    {
      title: "Typecheck Framer code",
      description: "Run Framer's TypeScript typechecker for a code file without executing local code.",
      inputSchema: {
        fileName: z.string().min(1),
        content: z.string(),
        compilerOptions: z.record(z.string(), z.unknown()).optional(),
        sessionId: z.string().optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const diagnostics = await framer.typecheckCode(args.fileName, args.content, args.compilerOptions, args.sessionId)
        return ok({
          diagnostics: diagnostics.map(serializeDiagnostic),
          diagnosticCount: diagnostics.length,
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_preview_code_file_update",
    {
      title: "Preview code file update",
      description: "Preview a guarded Framer code file update by returning diff, current version, detected exports, and typecheck diagnostics.",
      inputSchema: {
        idOrName: z.string().min(1),
        newContent: z.string(),
        compilerOptions: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const resolved = await getCodeFile(framer, args.idOrName)
        if (!resolved.file) return unresolvedFileResult(args.idOrName, resolved.matches)

        const diagnostics = await framer.typecheckCode(resolved.file.name, args.newContent, args.compilerOptions)

        return ok({
          file: serializeCodeFile(resolved.file, {
            includeContent: false,
            maxContentBytes: config.maxContentBytes,
          }),
          expectedVersionId: resolved.file.versionId,
          changed: resolved.file.content !== args.newContent,
          diff: createUnifiedDiff({
            fromLabel: `${resolved.file.name}@${resolved.file.versionId}`,
            toLabel: `${resolved.file.name}@proposed`,
            oldText: resolved.file.content,
            newText: args.newContent,
          }),
          currentExports: resolved.file.exports,
          detectedSourceExports: detectSourceExports(args.newContent),
          diagnostics: diagnostics.map(serializeDiagnostic),
          diagnosticCount: diagnostics.length,
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_apply_code_file_update",
    {
      title: "Apply code file update",
      description: "Apply a guarded Framer code file update. Requires expectedVersionId to prevent stale writes.",
      inputSchema: {
        idOrName: z.string().min(1),
        newContent: z.string(),
        expectedVersionId: z.string().min(1),
        compilerOptions: z.record(z.string(), z.unknown()).optional(),
        allowTypecheckErrors: z.boolean().optional(),
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer => {
        const resolved = await getCodeFile(framer, args.idOrName)
        if (!resolved.file) return unresolvedFileResult(args.idOrName, resolved.matches)

        const staleError = versionGuardError(resolved.file, args.expectedVersionId)
        if (staleError) return fail(staleError)

        const diagnostics = await framer.typecheckCode(resolved.file.name, args.newContent, args.compilerOptions)
        if (diagnostics.length > 0 && !args.allowTypecheckErrors) {
          return fail("Typecheck produced diagnostics. Pass allowTypecheckErrors only if the user explicitly accepts this.", {
            diagnostics: diagnostics.map(serializeDiagnostic),
          })
        }

        const updated = await resolved.file.setFileContent(args.newContent)
        return ok({
          updated: true,
          file: serializeCodeFile(updated, {
            includeContent: true,
            maxContentBytes: config.maxContentBytes,
          }),
          diagnostics: diagnostics.map(serializeDiagnostic),
          diagnosticCount: diagnostics.length,
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_create_code_file",
    {
      title: "Create code file",
      description: "Create a Framer code file after duplicate-name checks and optional typecheck blocking.",
      inputSchema: {
        name: z.string().min(1),
        content: z.string(),
        editViaPlugin: z.boolean().optional(),
        compilerOptions: z.record(z.string(), z.unknown()).optional(),
        allowTypecheckErrors: z.boolean().optional(),
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer => {
        const files = await framer.getCodeFiles()
        const duplicateError = duplicateNameError(files, args.name)
        if (duplicateError) return fail(duplicateError)

        const diagnostics = await framer.typecheckCode(args.name, args.content, args.compilerOptions)
        if (diagnostics.length > 0 && !args.allowTypecheckErrors) {
          return fail("Typecheck produced diagnostics. Pass allowTypecheckErrors only if the user explicitly accepts this.", {
            diagnostics: diagnostics.map(serializeDiagnostic),
          })
        }

        const file = await framer.createCodeFile(args.name, args.content, {
          editViaPlugin: args.editViaPlugin,
        })

        return ok({
          created: true,
          file: serializeCodeFile(file, {
            includeContent: true,
            maxContentBytes: config.maxContentBytes,
          }),
          diagnostics: diagnostics.map(serializeDiagnostic),
          diagnosticCount: diagnostics.length,
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_rename_code_file",
    {
      title: "Rename code file",
      description: "Rename a Framer code file with stale-version protection.",
      inputSchema: {
        idOrName: z.string().min(1),
        newName: z.string().min(1),
        expectedVersionId: z.string().min(1),
      },
      annotations: guardedWrite,
    },
    async args =>
      connection.withFramer(async framer => {
        const resolved = await getCodeFile(framer, args.idOrName)
        if (!resolved.file) return unresolvedFileResult(args.idOrName, resolved.matches)

        const staleError = versionGuardError(resolved.file, args.expectedVersionId)
        if (staleError) return fail(staleError)

        const duplicateError = duplicateNameError(await framer.getCodeFiles(), args.newName)
        if (duplicateError) return fail(duplicateError)

        const renamed = await resolved.file.rename(args.newName)
        return ok({
          renamed: true,
          file: serializeCodeFile(renamed, {
            includeContent: false,
            maxContentBytes: config.maxContentBytes,
          }),
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_remove_code_file",
    {
      title: "Remove code file",
      description: "Delete a Framer code file. Requires expectedVersionId and exact confirmName.",
      inputSchema: {
        idOrName: z.string().min(1),
        expectedVersionId: z.string().min(1),
        confirmName: z.string().min(1),
      },
      annotations: destructiveWrite,
    },
    async args =>
      connection.withFramer(async framer => {
        const resolved = await getCodeFile(framer, args.idOrName)
        if (!resolved.file) return unresolvedFileResult(args.idOrName, resolved.matches)

        const staleError = versionGuardError(resolved.file, args.expectedVersionId)
        if (staleError) return fail(staleError)

        const nameError = confirmNameError(resolved.file, args.confirmName)
        if (nameError) return fail(nameError)

        await resolved.file.remove()
        return ok({
          removed: true,
          id: resolved.file.id,
          name: resolved.file.name,
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_get_code_file_versions",
    {
      title: "Get code file versions",
      description: "List saved versions for a Framer code file.",
      inputSchema: {
        idOrName: z.string().min(1),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const resolved = await getCodeFile(framer, args.idOrName)
        if (!resolved.file) return unresolvedFileResult(args.idOrName, resolved.matches)

        const versions = await resolved.file.getVersions()
        return ok({
          file: serializeCodeFile(resolved.file, {
            includeContent: false,
            maxContentBytes: config.maxContentBytes,
          }),
          versions: versions.map(serializeCodeFileVersion),
        })
      }),
  )

  registerSafeTool(
    server,
    "framer_get_code_file_version_content",
    {
      title: "Get code file version content",
      description: "Fetch capped source content for a specific saved code file version.",
      inputSchema: {
        idOrName: z.string().min(1),
        versionId: z.string().min(1),
      },
      annotations: readOnly,
    },
    async args =>
      connection.withFramer(async framer => {
        const resolved = await getCodeFile(framer, args.idOrName)
        if (!resolved.file) return unresolvedFileResult(args.idOrName, resolved.matches)

        const versions = await resolved.file.getVersions()
        const version = versions.find(candidate => candidate.id === args.versionId)
        if (!version) return fail(`Version ${args.versionId} was not found for ${resolved.file.name}.`)

        const content = await version.getContent()
        const limited = limitString(content, config.maxContentBytes)
        return ok({
          version: serializeCodeFileVersion(version),
          content: limited.value,
          contentTruncated: limited.truncated,
          contentBytes: limited.originalBytes,
          returnedContentBytes: limited.returnedBytes,
        })
      }),
  )
}

async function getCodeFile(framer: Framer, idOrName: string) {
  const files = await framer.getCodeFiles()
  return resolveCodeFile(files, idOrName)
}

function unresolvedFileResult(idOrName: string, matches: readonly CodeFile[]) {
  if (matches.length > 1) {
    return fail(`Code file reference "${idOrName}" is ambiguous. Use the exact id.`, {
      matches: matches.map(file => ({ id: file.id, name: file.name, path: file.path, versionId: file.versionId })),
    })
  }

  return fail(`Code file "${idOrName}" was not found.`)
}
