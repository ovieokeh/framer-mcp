import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js"

export type JsonObject = { [key: string]: unknown }

export function jsonString(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function ok(structuredContent: JsonObject): CallToolResult {
  return {
    content: [{ type: "text", text: jsonString(structuredContent) }],
    structuredContent,
  }
}

export function textResult(text: string, structuredContent?: JsonObject): CallToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
  }
}

export function fail(message: string, details?: JsonObject): CallToolResult {
  const structuredContent = {
    error: {
      message,
      ...(details ? { details } : {}),
    },
  }

  return {
    content: [{ type: "text", text: jsonString(structuredContent) }],
    structuredContent,
    isError: true,
  }
}

export function resourceJson(uri: string, value: unknown): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: jsonString(value),
      },
    ],
  }
}

export function resourceText(uri: string, text: string, mimeType = "text/plain"): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType,
        text,
      },
    ],
  }
}
