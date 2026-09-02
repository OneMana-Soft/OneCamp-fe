import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const streamFetch = vi.fn();
vi.mock("@/lib/utils/streamFetch", () => ({
    authedStreamFetch: (...args: unknown[]) => streamFetch(...args),
}));

import { useAskAIStream, type AskStreamResult } from "@/services/aiService";

/** A response whose body yields the given SSE lines, one chunk each. */
function sse(...events: string[]) {
    const encoder = new TextEncoder();
    let i = 0;
    return {
        ok: true,
        statusText: "OK",
        body: {
            getReader: () => ({
                read: async () =>
                    i < events.length
                        ? { done: false, value: encoder.encode(`data: ${events[i++]}\n\n`) }
                        : { done: true, value: undefined },
                cancel: () => undefined,
            }),
        },
    };
}

describe("the conversation an answer belongs to", () => {
    beforeEach(() => streamFetch.mockReset());

    it("adopts the id the server minted", async () => {
        streamFetch.mockResolvedValue(
            sse('{"session_id": "s-1"}', '{"content": "hello"}', '{"done": true}'),
        );

        const { result } = renderHook(() => useAskAIStream());
        const got: { out: AskStreamResult | null } = { out: null };
        await act(async () => {
            got.out = await result.current.askStream("hi");
        });

        // Without this the client had no id to send back, so every question
        // opened a new conversation and none of them were ever listed.
        expect(got.out?.sessionId).toBe("s-1");
        expect(got.out?.text).toBe("hello");
    });

    it("sends the id back on the next question", async () => {
        streamFetch.mockResolvedValue(sse('{"content": "ok"}', '{"done": true}'));

        const { result } = renderHook(() => useAskAIStream());
        await act(async () => {
            await result.current.askStream("second", "s-1");
        });

        expect(streamFetch.mock.calls[0][1].jsonBody.session_id).toBe("s-1");
    });

    it("keeps the conversation when the answer never arrives", async () => {
        // The id is sent before any content on purpose: an answer that failed
        // half way is still an exchange worth returning to.
        streamFetch.mockResolvedValue(sse('{"session_id": "s-2"}'));

        const { result } = renderHook(() => useAskAIStream());
        const got: { out: AskStreamResult | null } = { out: null };
        await act(async () => {
            got.out = await result.current.askStream("hi");
        });

        expect(got.out?.sessionId).toBe("s-2");
    });
});
