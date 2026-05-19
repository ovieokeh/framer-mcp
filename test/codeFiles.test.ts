import assert from "node:assert/strict"
import test from "node:test"
import {
  confirmNameError,
  detectSourceExports,
  duplicateNameError,
  filterCodeFilesByExportType,
  resolveCodeFile,
  versionGuardError,
  type CodeFileLike,
} from "../lib/codeFiles.js"

const files = [
  {
    id: "file-1",
    name: "Overrides.tsx",
    path: "Overrides.tsx",
    content: "export function withFoo(Component) { return Component }",
    versionId: "v1",
    exports: [{ type: "override", name: "withFoo", isDefaultExport: false }],
  },
  {
    id: "file-2",
    name: "Hero.tsx",
    path: "Hero.tsx",
    content: "export default function Hero() { return null }",
    versionId: "v2",
    exports: [{ type: "component", name: "default", isDefaultExport: true, insertURL: "https://example.com/hero.js" }],
  },
] satisfies CodeFileLike[]

test("resolveCodeFile resolves by id, name, or path", () => {
  assert.equal(resolveCodeFile(files, "file-1").file?.name, "Overrides.tsx")
  assert.equal(resolveCodeFile(files, "Hero.tsx").file?.id, "file-2")
})

test("version and delete confirmation guards return actionable errors", () => {
  assert.equal(versionGuardError(files[0], "v1"), null)
  assert.match(versionGuardError(files[0], "old") ?? "", /Stale code file version/u)
  assert.equal(confirmNameError(files[0], "Overrides.tsx"), null)
  assert.match(confirmNameError(files[0], "Wrong.tsx") ?? "", /Confirmation name mismatch/u)
})

test("duplicateNameError blocks duplicate names or paths", () => {
  assert.match(duplicateNameError(files, "Hero.tsx") ?? "", /already exists/u)
  assert.equal(duplicateNameError(files, "NewOverride.tsx"), null)
})

test("filterCodeFilesByExportType returns export-specific files", () => {
  assert.deepEqual(
    filterCodeFilesByExportType(files, "override").map(file => file.id),
    ["file-1"],
  )
  assert.deepEqual(
    filterCodeFilesByExportType(files, "component").map(file => file.id),
    ["file-2"],
  )
})

test("detectSourceExports detects common exported functions and constants", () => {
  const detected = detectSourceExports(`
    export function withTracking(Component) { return Component }
    export const withText = Component => Component
    export default function MyComponent() { return null }
  `)

  assert.deepEqual(
    detected.map(item => item.name),
    ["withTracking", "withText", "MyComponent"],
  )
  assert.equal(detected[0]?.likelyType, "override")
})
