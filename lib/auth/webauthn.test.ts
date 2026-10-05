import { describe, expect, it } from "vitest"
import { b64urlToBuffer, bufferToB64url, passkeyErrorMessage, toRequestOptions } from "./webauthn"

describe("webauthn encoding", () => {
  it("round-trips base64url, padding and all", () => {
    for (const len of [0, 1, 2, 3, 16, 31, 32]) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37 + 250) % 256)
      const s = bufferToB64url(bytes)
      expect(s).not.toMatch(/[+/=]/)
      expect(new Uint8Array(b64urlToBuffer(s))).toEqual(bytes)
    }
  })
  it("turns the server's options into the browser's", () => {
    const opts = toRequestOptions({ publicKey: { challenge: "AQID", rpId: "acme.test", userVerification: "required" } })
    expect(new Uint8Array(opts.challenge as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    expect(opts.rpId).toBe("acme.test")
  })
  it("stays quiet when someone cancels", () => {
    expect(passkeyErrorMessage({ name: "NotAllowedError" })).toBeNull()
    expect(passkeyErrorMessage({ name: "SecurityError" })).toMatch(/address/)
  })
})
