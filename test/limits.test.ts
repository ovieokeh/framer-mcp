import assert from "node:assert/strict"
import test from "node:test"
import { limitString } from "../lib/limits.js"

test("limitString returns original text when under the byte limit", () => {
  const limited = limitString("hello", 10)

  assert.equal(limited.value, "hello")
  assert.equal(limited.truncated, false)
  assert.equal(limited.originalBytes, 5)
})

test("limitString truncates by bytes", () => {
  const limited = limitString("hello world", 5)

  assert.equal(limited.value, "hello")
  assert.equal(limited.truncated, true)
  assert.equal(limited.originalBytes, 11)
  assert.equal(limited.returnedBytes, 5)
})
