import { describe, expect, it } from "vitest"
import { CHUNK_RECOVERY_SCRIPT, isChunkLoadError } from "./chunkRecovery"

describe("chunk recovery", () => {
  it.each([
    { name: "ChunkLoadError", message: "Loading chunk 735 failed." },
    new Error("Failed to load chunk /_next/static/chunks/c74c6019fac0e2df.js from module 735393"),
    new Error("Loading CSS chunk 12 failed"),
  ])("recognises %o", (e) => expect(isChunkLoadError(e)).toBe(true))
  it("leaves other errors alone", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
  it("ships a script that parses", () => expect(() => new Function(CHUNK_RECOVERY_SCRIPT)).not.toThrow())
})
