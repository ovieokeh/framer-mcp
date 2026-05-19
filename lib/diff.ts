export interface UnifiedDiffOptions {
  fromLabel: string
  toLabel: string
  oldText: string
  newText: string
  contextLines?: number
  maxLines?: number
}

export function createUnifiedDiff({
  fromLabel,
  toLabel,
  oldText,
  newText,
  contextLines = 3,
  maxLines = 400,
}: UnifiedDiffOptions): string {
  if (oldText === newText) return `--- ${fromLabel}\n+++ ${toLabel}\n`

  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)

  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldStart = Math.max(0, prefix - contextLines)
  const newStart = Math.max(0, prefix - contextLines)
  const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + contextLines)
  const newEnd = Math.min(newLines.length, newLines.length - suffix + contextLines)

  const output = [
    `--- ${fromLabel}`,
    `+++ ${toLabel}`,
    `@@ -${oldStart + 1},${oldEnd - oldStart} +${newStart + 1},${newEnd - newStart} @@`,
  ]

  for (let index = oldStart; index < prefix; index += 1) output.push(` ${oldLines[index]}`)
  for (let index = prefix; index < oldLines.length - suffix; index += 1) output.push(`-${oldLines[index]}`)
  for (let index = prefix; index < newLines.length - suffix; index += 1) output.push(`+${newLines[index]}`)
  for (let index = oldLines.length - suffix; index < oldEnd; index += 1) output.push(` ${oldLines[index]}`)

  if (output.length > maxLines) {
    return [...output.slice(0, maxLines), `... diff truncated after ${maxLines} lines`].join("\n")
  }

  return output.join("\n")
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split(/\r?\n/u)
}
