import { beforeEach, describe, expect, it, vi } from "vitest"

const streamFetch = vi.fn()
vi.mock("@/lib/utils/streamFetch", () => ({
  authedStreamFetch: (...args: unknown[]) => streamFetch(...args),
}))

import { streamDocAI } from "./docAIStream"

// The bar's stream (ai-search-io P0-4, P0-6): the model is named first, a
// cleaned answer replaces what streamed, and every ending says what happened.

function sse(payloads: unknown[], { ok = true, cut = false } = {}) {
  const text = payloads.map((p) => (typeof p === "string" ? p : `data: ${JSON.stringify(p)}\n\n`)).join("")
  const bytes = new TextEncoder().encode(text)
  let sent = false
  return {
    ok,
    statusText: ok ? "OK" : "Bad Request",
    json: async () => (ok ? {} : payloads[0]),
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) {
            if (cut) throw new TypeError("network error")
            return { done: true, value: undefined }
          }
          sent = true
          return { done: false, value: bytes }
        },
        cancel: () => undefined,
        releaseLock: () => undefined,
      }),
    },
  }
}

// A block body: a function returned from beforeEach is run as its cleanup.
beforeEach(() => {
  streamFetch.mockReset()
})

const model = { name: "qwen3:4b", label: "qwen3 4B", provider: "ollama", local: true }

describe("the doc AI stream", () => {
  it("names the model, shows each piece, then takes the cleaned answer", async () => {
    streamFetch.mockResolvedValue(
      sse([
        ": ping\n\n",
        { model },
        { progress: { step: "reading", done: 1, of: 3 } },
        { content: "Sure! Here's the text:\n\n" },
        { content: "We ship **Friday**." },
        { replace: "We ship **Friday**." },
        { notice: "Only the first part of the doc was read." },
        { done: true },
      ]),
    )
    const seen: string[] = []
    const onModel = vi.fn()
    const onProgress = vi.fn()
    const out = await streamDocAI({ action: "improve", text: "we ship friday" }, { onModel, onProgress, onText: (t) => seen.push(t) })
    expect(onModel).toHaveBeenCalledWith(model)
    expect(onProgress).toHaveBeenCalledWith({ step: "reading", done: 1, of: 3 })
    expect(seen.at(-1)).toBe("We ship **Friday**.")
    expect(out).toEqual({ text: "We ship **Friday**.", model, notice: "Only the first part of the doc was read.", stopped: false, error: "" })
    expect(streamFetch.mock.calls[0][0]).toBe("/ai/doc/complete/stream")
  })

  it("says the server's reason when it refuses", async () => {
    streamFetch.mockResolvedValue(sse([{ msg: "Select some text first, then ask again." }], { ok: false }))
    expect((await streamDocAI({ action: "improve" }, {})).error).toBe("Select some text first, then ask again.")
  })

  it("passes on an error the model ran into", async () => {
    streamFetch.mockResolvedValue(sse([{ model }, { error: "The model took too long. Try again." }]))
    expect((await streamDocAI({ action: "continue" }, {})).error).toBe("The model took too long. Try again.")
  })

  it("says an answer was cut off, or never came", async () => {
    streamFetch.mockResolvedValue(sse([{ content: "half an ans" }], { cut: true }))
    expect((await streamDocAI({ action: "write", prompt: "x" }, {})).error).toBe("Couldn't reach the server. Check your connection and try again.")
    streamFetch.mockResolvedValue(sse([{ content: "half an ans" }]))
    expect((await streamDocAI({ action: "write", prompt: "x" }, {})).error).toBe("The answer was cut off. Try again.")
    streamFetch.mockResolvedValue(sse([{ content: "   " }, { done: true }]))
    expect((await streamDocAI({ action: "write", prompt: "x" }, {})).error).toBe("The model sent back nothing. Try again, or pick another model.")
    streamFetch.mockRejectedValue(new TypeError("Failed to fetch"))
    expect((await streamDocAI({ action: "write", prompt: "x" }, {})).error).toBe("Couldn't reach the server. Check your connection and try again.")
  })

  it("reads a stop as a stop, not as an error", async () => {
    const abort = new AbortController()
    streamFetch.mockImplementation(async () => {
      abort.abort()
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    })
    expect(await streamDocAI({ action: "write", prompt: "x" }, {}, abort.signal)).toMatchObject({ stopped: true, error: "" })
  })
})
