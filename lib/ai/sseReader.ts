// One reader for the AI streams (Server-Sent Events, one JSON object per
// event): Ask AI, the doc assistant.
//
// The readers this replaces split each network read on "\n" and parsed every
// piece on its own. A read ends wherever the network cut it, so a `data:` line
// split across two reads became two halves that were each invalid JSON, and
// both were skipped without a word: words went missing from answers, and a
// whole "done" or "actions" frame could vanish. They then un-escaped "\n" and
// "\"" a second time after JSON.parse had already done it, so code with a
// literal \n in it came out with a line break.
//
// Here bytes are decoded as a stream (a character split between reads is
// joined, not replaced), lines are kept until they are whole, and an event is
// handed on only at the blank line that ends it, parsed once.

/** Turns text, in pieces as it arrives, into the events' parsed data. */
export function createSSEParser() {
    let pending = ""
    let data: string[] = []

    const dispatch = (out: unknown[]) => {
        if (data.length === 0) return
        const payload = data.join("\n")
        data = []
        try {
            const value = JSON.parse(payload)
            // Every frame is an object; anything else has nothing to read.
            if (value !== null && typeof value === "object") out.push(value)
        } catch {
            // The server encodes every frame with json.Marshal, so this is not
            // a frame cut in half (that is joined above); nothing to show.
        }
    }

    const line = (raw: string, out: unknown[]) => {
        const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw
        if (text === "") {
            dispatch(out)
            return
        }
        if (text.startsWith(":")) return // a comment, e.g. a keep-alive ping
        if (text.startsWith("data:")) {
            const value = text.slice(5)
            data.push(value.startsWith(" ") ? value.slice(1) : value)
        }
        // Other fields (event:, id:, retry:) are not used by these streams.
    }

    return {
        /** Feed decoded text; returns the events completed by it. */
        push(text: string): unknown[] {
            const out: unknown[] = []
            pending += text
            let at = pending.indexOf("\n")
            while (at >= 0) {
                line(pending.slice(0, at), out)
                pending = pending.slice(at + 1)
                at = pending.indexOf("\n")
            }
            return out
        },
        /** The stream ended: hand on an event it ended without closing. */
        end(): unknown[] {
            const out: unknown[] = []
            if (pending !== "") {
                line(pending, out)
                pending = ""
            }
            dispatch(out)
            return out
        },
    }
}

/** Reads a response body and yields each event's parsed data, in order. */
export async function* readSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<any> {
    const decoder = new TextDecoder()
    const parser = createSSEParser()
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        yield* parser.push(decoder.decode(value, { stream: true }))
    }
    yield* parser.push(decoder.decode())
    yield* parser.end()
}
