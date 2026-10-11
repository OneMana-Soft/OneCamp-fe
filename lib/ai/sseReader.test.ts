import { describe, expect, it } from "vitest"

import { createSSEParser, readSSE } from "@/lib/ai/sseReader"

// What the server sends: each frame is "data: " + json.Marshal(payload) + "\n\n".
const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`

// Text a model really writes: a Windows path, a tab, quotes, a literal
// backslash-n in code, real line breaks, and text beyond ASCII.
const tricky = [
    "C:\\path\\new",
    "col1\tcol2",
    'she said "hi"',
    'fmt.Println("a\\nb")',
    "line one\nline two\r\n",
    "naïve café — 日本語 😀",
    "\\",
]

// A reader over the given byte pieces, as the network might deliver them.
function readerOf(pieces: Uint8Array[]): ReadableStreamDefaultReader<Uint8Array> {
    let i = 0
    return {
        read: async () => (i < pieces.length ? { done: false, value: pieces[i++] } : { done: true, value: undefined }),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>
}

async function collect(pieces: Uint8Array[]) {
    const out: any[] = []
    for await (const data of readSSE(readerOf(pieces))) out.push(data)
    return out
}

// Every way of cutting the bytes in two, and in pieces of each small size.
function cuts(bytes: Uint8Array): Uint8Array[][] {
    const all: Uint8Array[][] = []
    for (let at = 0; at <= bytes.length; at++) all.push([bytes.slice(0, at), bytes.slice(at)])
    for (const size of [1, 2, 3, 5, 7]) {
        const pieces: Uint8Array[] = []
        for (let at = 0; at < bytes.length; at += size) pieces.push(bytes.slice(at, at + size))
        all.push(pieces)
    }
    return all
}

describe("the AI stream reader", () => {
    it("gives back every chunk of text exactly as it was sent, however the bytes are cut", async () => {
        const stream = [{ session_id: "s1" }, ...tricky.map((content) => ({ content })), { done: true }]
        const bytes = new TextEncoder().encode(stream.map(frame).join(""))
        for (const pieces of cuts(bytes)) {
            const got = await collect(pieces)
            expect(got).toEqual(stream)
            expect(got.filter((d) => d.content).map((d) => d.content).join("")).toBe(tricky.join(""))
        }
    })

    it("joins a character split between two reads instead of replacing it", async () => {
        const bytes = new TextEncoder().encode(frame({ content: "😀" }))
        const mid = bytes.indexOf(0xf0) + 2 // inside the four bytes of the emoji
        expect(await collect([bytes.slice(0, mid), bytes.slice(mid)])).toEqual([{ content: "😀" }])
    })

    it("does not un-escape a second time: a literal backslash-n stays two characters", async () => {
        const got = await collect([new TextEncoder().encode(frame({ content: "a\\nb" }))])
        expect(got[0].content).toBe("a\\nb")
        expect(got[0].content).not.toContain("\n")
    })

    it("hands on a last event the stream ended without closing", async () => {
        const bytes = new TextEncoder().encode(frame({ content: "x" }) + `data: {"done": true}`)
        expect(await collect([bytes])).toEqual([{ content: "x" }, { done: true }])
    })

    it("takes CRLF line ends, comments and data without the space", () => {
        const p = createSSEParser()
        expect(p.push(': ping\r\n\r\ndata:{"content":"a"}\r\n\r\n')).toEqual([{ content: "a" }])
        expect(p.end()).toEqual([])
    })

    it("skips a frame that is not a JSON object, and goes on", () => {
        const p = createSSEParser()
        expect(p.push('data: not json\n\ndata: null\n\ndata: {"content":"b"}\n\n')).toEqual([{ content: "b" }])
    })
})
