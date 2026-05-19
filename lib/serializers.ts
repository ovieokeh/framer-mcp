import type {
  AnyNode,
  CodeFile,
  CodeFileExport,
  CodeFileVersion,
  ColorStyle,
  ProjectInfo,
  TextStyle,
  TypecheckDiagnostic,
  User,
} from "framer-api"
import { limitString } from "./limits.js"
import { summarizeExports } from "./codeFiles.js"

export interface SerializationOptions {
  includeContent?: boolean
  maxContentBytes: number
}

export function serializeProjectInfo(projectInfo: ProjectInfo): Record<string, unknown> {
  return {
    id: projectInfo.id,
    apiVersion1Id: projectInfo.apiVersion1Id,
    name: projectInfo.name,
  }
}

export function serializeUser(user: Readonly<User>): Record<string, unknown> {
  return {
    id: user.id,
    apiVersion1Id: user.apiVersion1Id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    initials: user.initials,
  }
}

export function serializeCodeFile(
  file: CodeFile,
  { includeContent = false, maxContentBytes }: SerializationOptions,
): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    id: file.id,
    name: file.name,
    path: file.path,
    versionId: file.versionId,
    exports: serializeCodeFileExports(file.exports),
    contentBytes: Buffer.byteLength(file.content, "utf8"),
  }

  if (includeContent) {
    const limited = limitString(file.content, maxContentBytes)
    serialized.content = limited.value
    serialized.contentTruncated = limited.truncated
    serialized.returnedContentBytes = limited.returnedBytes
  }

  return serialized
}

export function serializeCodeFileExports(exports: readonly CodeFileExport[]): Array<Record<string, unknown>> {
  return summarizeExports(exports)
}

export function serializeCodeFileVersion(version: CodeFileVersion): Record<string, unknown> {
  return {
    id: version.id,
    name: version.name,
    createdAt: version.createdAt,
    createdBy: serializeUser(version.createdBy),
  }
}

export function serializeDiagnostic(diagnostic: TypecheckDiagnostic): Record<string, unknown> {
  return {
    message: diagnostic.message,
    code: diagnostic.code,
    category: diagnostic.category,
    fileName: diagnostic.fileName,
    span: diagnostic.span
      ? {
          offset: diagnostic.span.offset,
          length: diagnostic.span.length,
          start: diagnostic.span.start,
          end: diagnostic.span.end,
        }
      : undefined,
  }
}

export function serializeNode(node: AnyNode, depth = 2): Record<string, unknown> {
  return sanitizeFramerValue(node, depth) as Record<string, unknown>
}

export function serializeColorStyle(style: ColorStyle): Record<string, unknown> {
  return sanitizeFramerValue(style, 2) as Record<string, unknown>
}

export function serializeTextStyle(style: TextStyle): Record<string, unknown> {
  return sanitizeFramerValue(style, 2) as Record<string, unknown>
}

export function sanitizeFramerValue(value: unknown, depth = 4, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function" || typeof value === "symbol") return undefined
  if (value instanceof Uint8Array) return { type: "Uint8Array", byteLength: value.byteLength }
  if (value instanceof Date) return value.toISOString()
  if (depth <= 0) return summaryForObject(value)

  if (Array.isArray(value)) {
    return value.map(item => sanitizeFramerValue(item, depth - 1, seen))
  }

  if (typeof value !== "object") return value
  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  const result: Record<string, unknown> = {}

  for (const key of enumerableAndAccessorKeys(value)) {
    if (key.startsWith("_") || key === "constructor") continue

    try {
      const propertyValue = (value as Record<string, unknown>)[key]
      if (typeof propertyValue === "function") continue
      const sanitized = sanitizeFramerValue(propertyValue, depth - 1, seen)
      if (sanitized !== undefined) result[key] = sanitized
    } catch {
      result[key] = "[Unavailable]"
    }
  }

  const className = value.constructor?.name
  if (className && className !== "Object" && !("type" in result)) result.type = className

  return result
}

function enumerableAndAccessorKeys(value: object): string[] {
  const keys = new Set(Object.keys(value))

  let prototype = Object.getPrototypeOf(value)
  while (prototype && prototype !== Object.prototype) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
      if (typeof descriptor.get === "function") keys.add(key)
    }
    prototype = Object.getPrototypeOf(prototype)
  }

  return [...keys]
}

function summaryForObject(value: unknown): unknown {
  if (value && typeof value === "object") {
    const maybeId = (value as { id?: unknown }).id
    const maybeName = (value as { name?: unknown }).name
    return {
      type: value.constructor?.name ?? "Object",
      ...(typeof maybeId === "string" ? { id: maybeId } : {}),
      ...(typeof maybeName === "string" ? { name: maybeName } : {}),
    }
  }

  return value
}
