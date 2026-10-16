import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const streamFetch = vi.fn();
vi.mock("@/lib/utils/streamFetch", () => ({
    authedStreamFetch: (...args: unknown[]) => streamFetch(...args),
}));

import { useAskAIStream } from "@/services/aiService";
import { streamDocAI } from "@/lib/ai/docAIStream";

// Text a model really writes: a Windows path, a tab, quotes, a literal
// backslash-n in code, and text beyond ASCII.
const chunks = ["See C:\\path\\new", "\tcol2", ' "quoted"', ' fmt.Println("a\\nb")', " naïve 😀"];
const text = chunks.join("");

/**
 * A response that sends these frames as the server does (json.Marshal), but
 * delivered in pieces of `size` bytes, so lines and characters are cut
 * between reads the way a network cuts them.
 */
function sseInPieces(payloads: unknown[], size: number) {
    const bytes = new TextEncoder().encode(payloads.map((p) => `data: ${JSON.stringify(p)}\n\n`).join(""));
    let at = 0;
    return {
        ok: true,
        statusText: "OK",
        body: {
            getReader: () => ({
                read: async () => {
                    if (at >= bytes.length) return { done: true, value: undefined };
                    const value = bytes.slice(at, at + size);
                    at += size;
                    return { done: false, value };
                },
                cancel: () => undefined,
            }),
        },
    };
}

describe("streamed AI text arrives whole", () => {
    // A block body: a function returned from beforeEach is run as its cleanup.
    beforeEach(() => {
        streamFetch.mockReset();
    });

    for (const size of [5, 13, 64]) {
        it(`in Ask AI, read ${size} bytes at a time`, async () => {
            streamFetch.mockResolvedValue(
                sseInPieces([{ session_id: "s-1" }, ...chunks.map((content) => ({ content })), { done: true }], size),
            );
            const { result } = renderHook(() => useAskAIStream());
            let out: Awaited<ReturnType<typeof result.current.askStream>> = null;
            await act(async () => {
                out = await result.current.askStream("hi");
            });
            expect(out).not.toBeNull();
            expect(out!.text).toBe(text);
            expect(out!.sessionId).toBe("s-1");
        });

        // The doc AI bar and panel stream through lib/ai/docAIStream.
        it(`in doc AI, read ${size} bytes at a time`, async () => {
            streamFetch.mockResolvedValue(sseInPieces([...chunks.map((content) => ({ content })), { done: true }], size));
            const seen: string[] = [];
            const out = await streamDocAI({ action: "write", prompt: "x" }, { onText: (t) => seen.push(t) });
            expect(out.error).toBe("");
            // Whole, then trimmed as the bar takes it.
            expect(seen.at(-1)).toBe(text);
            expect(out.text).toBe(text.trim());
        });
    }
});
