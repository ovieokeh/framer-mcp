export interface LimitedString {
  value: string
  truncated: boolean
  originalBytes: number
  returnedBytes: number
}

export function limitString(value: string, maxBytes: number): LimitedString {
  const bytes = Buffer.byteLength(value, "utf8")
  if (bytes <= maxBytes) {
    return {
      value,
      truncated: false,
      originalBytes: bytes,
      returnedBytes: bytes,
    }
  }

  const buffer = Buffer.from(value, "utf8").subarray(0, maxBytes)
  const truncated = buffer.toString("utf8").replace(/\uFFFD$/u, "")

  return {
    value: truncated,
    truncated: true,
    originalBytes: bytes,
    returnedBytes: Buffer.byteLength(truncated, "utf8"),
  }
}
