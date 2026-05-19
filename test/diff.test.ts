import assert from "node:assert/strict"
import test from "node:test"
import { createUnifiedDiff } from "../lib/diff.js"

test("createUnifiedDiff emits a compact unified diff", () => {
  const diff = createUnifiedDiff({
    fromLabel: "old.tsx",
    toLabel: "new.tsx",
    oldText: "a\nb\nc",
    newText: "a\nB\nc",
  })

  assert.match(diff, /--- old\.tsx/u)
  assert.match(diff, /\+\+\+ new\.tsx/u)
  assert.match(diff, /-b/u)
  assert.match(diff, /\+B/u)
})

test("createUnifiedDiff truncates very large diffs", () => {
  const diff = createUnifiedDiff({
    fromLabel: "old",
    toLabel: "new",
    oldText: Array.from({ length: 20 }, (_, index) => `old ${index}`).join("\n"),
    newText: Array.from({ length: 20 }, (_, index) => `new ${index}`).join("\n"),
    maxLines: 5,
  })

  assert.match(diff, /diff truncated/u)
})
