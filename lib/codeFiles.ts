import type { CodeFile, CodeFileExport } from "framer-api"

export type CodeFileLike = Pick<CodeFile, "id" | "name" | "path" | "content" | "exports" | "versionId">

export interface CodeFileResolution<T extends CodeFileLike> {
  file: T | null
  matches: T[]
}

export function resolveCodeFile<T extends CodeFileLike>(
  files: readonly T[],
  idOrName: string,
): CodeFileResolution<T> {
  const matches = files.filter(file => file.id === idOrName || file.name === idOrName || file.path === idOrName)
  return {
    file: matches.length === 1 ? matches[0] : null,
    matches,
  }
}

export function versionGuardError(file: CodeFileLike, expectedVersionId: string): string | null {
  if (file.versionId === expectedVersionId) return null
  return `Stale code file version for ${file.name}: expected ${expectedVersionId}, current ${file.versionId}. Refetch before writing.`
}

export function confirmNameError(file: CodeFileLike, confirmName: string): string | null {
  if (file.name === confirmName) return null
  return `Confirmation name mismatch: expected exact file name "${file.name}".`
}

export function duplicateNameError(files: readonly CodeFileLike[], name: string): string | null {
  const duplicate = files.find(file => file.name === name || file.path === name)
  return duplicate ? `A code file named or pathed "${name}" already exists (${duplicate.id}).` : null
}

export function filterCodeFilesByExportType<T extends CodeFileLike>(
  files: readonly T[],
  exportType: "all" | "component" | "override",
): T[] {
  if (exportType === "all") return [...files]
  return files.filter(file => file.exports.some(exportItem => exportItem.type === exportType))
}

export function summarizeExports(exports: readonly CodeFileExport[]): Array<Record<string, unknown>> {
  return exports.map(exportItem => ({
    type: exportItem.type,
    name: exportItem.name,
    isDefaultExport: exportItem.isDefaultExport,
    ...(exportItem.type === "component" ? { insertURL: exportItem.insertURL } : {}),
  }))
}

export function detectSourceExports(source: string): Array<Record<string, unknown>> {
  const exports: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  const patterns = [
    /export\s+function\s+([A-Za-z_$][\w$]*)/gu,
    /export\s+const\s+([A-Za-z_$][\w$]*)/gu,
    /export\s+default\s+function\s*([A-Za-z_$][\w$]*)?/gu,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1] || "default"
      const key = `${pattern.source}:${name}`
      if (seen.has(key)) continue
      seen.add(key)

      exports.push({
        name,
        isDefaultExport: /default/u.test(match[0]),
        likelyType: name.startsWith("with") ? "override" : "unknown",
      })
    }
  }

  return exports
}
