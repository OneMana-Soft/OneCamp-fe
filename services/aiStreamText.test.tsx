import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const streamFetch = vi.fn();
vi.mock("@/lib/utils/streamFetch", () => ({
    authedStreamFetch: (...args: unknown[]) => streamFetch(...args),
}));

import { useAskAIStream, useDocAI } from "@/services/aiService";

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
    beforeEach(() => streamFetch.mockReset());

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

        it(`in the doc assistant, read ${size} bytes at a time`, async () => {
            streamFetch.mockResolvedValue(sseInPieces([...chunks.map((content) => ({ content })), { done: true }], size));
            const { result } = renderHook(() => useDocAI());
            await act(async () => {
                await result.current.completeStream("write", "x");
            });
            expect(result.current.streamText).toBe(text);
            expect(result.current.error).toBeNull();
        });
    }
});
