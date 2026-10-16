// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

// FE-F-10, over a real connection: the API client's timeout fails a send the
// server never answers, and never cuts short an upload or the model's work
// that takes longer. The default is shortened here (the client reads it from
// its own defaults), so the test waits milliseconds, not 30 seconds.

vi.mock("@/store/store", () => ({ default: { dispatch: vi.fn() } }))
vi.mock("@/store/slice/refreshSlice", () => ({ updateRefreshTokenStatus: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }))
vi.mock("@/lib/sessionEnd", () => ({ endSession: vi.fn() }))
vi.mock("@/lib/http/loadFailure", () => ({ tellReadFailure: vi.fn() }))

const { default: api } = await import("@/lib/axiosInstance")
const { REQUEST_TIMEOUT_MS } = await import("@/lib/http/requestTimeout")
const loadedTimeout = api.defaults.timeout

const SHORT = 300
let server: Server
let received = 0

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let bytes = 0
    req.on("data", (chunk: Buffer) => (bytes += chunk.length))
    req.on("end", () => {
      // A send the server never answers: the link stalled.
      if (req.url === "/po/createPost") return
      received = bytes
      // An upload, and the model's work: answered well after the timeout.
      setTimeout(() => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ msg: "ok" })), SHORT * 3)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  api.defaults.baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  api.defaults.timeout = SHORT
})

afterAll(async () => {
  api.defaults.timeout = REQUEST_TIMEOUT_MS
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

describe("the API client's timeout", () => {
  it("waits 30 seconds for an answer", () => {
    expect(loadedTimeout).toBe(30_000)
  })

  it("fails a send the server never answers", async () => {
    const err = await api.post("/po/createPost", { channel_id: "c1", post_text_html: "<p>hi</p>" }).catch((e) => e)
    expect(err?.code).toBe("ECONNABORTED")
    expect(err?.message).toBe(`timeout of ${SHORT}ms exceeded`)
  })

  it("lets a large upload that takes longer finish", async () => {
    const form = new FormData()
    form.append("file", new Blob([new Uint8Array(8 * 1024 * 1024)]), "big.bin")
    const res = await api.post("/uploadFile", form)
    expect(res.status).toBe(200)
    expect(received).toBeGreaterThan(8 * 1024 * 1024)
  })

  it("lets the model take its time", async () => {
    const res = await api.post("/ai/catch-up", { channel_id: "c1" })
    expect(res.status).toBe(200)
  })

  it("keeps a timeout a request set for itself", async () => {
    const err = await api.post("/ai/catch-up", {}, { timeout: SHORT / 3 }).catch((e) => e)
    expect(err?.code).toBe("ECONNABORTED")
  })
})
