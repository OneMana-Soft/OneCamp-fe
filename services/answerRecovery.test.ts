import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/axiosInstance", () => ({ default: { post: vi.fn() } }))

import axiosInstance from "@/lib/axiosInstance"
import { ANSWER_WAIT_MAX_MS, nextRecoveryStep, stopAnswer } from "./answerRecovery"
import { PostEndpointUrl } from "./endPoints"

describe("nextRecoveryStep", () => {
    it("adopts what is recorded the moment the answer is no longer live", () => {
        expect(nextRecoveryStep(false, 0)).toBe("adopt")
        expect(nextRecoveryStep(false, 5_000)).toBe("adopt")
    })

    it("keeps waiting while the server is still writing", () => {
        // The whole point: a person who left mid-answer and came back sees the
        // answer arrive rather than a conversation that forgot the question.
        expect(nextRecoveryStep(true, 0)).toBe("wait")
        expect(nextRecoveryStep(true, ANSWER_WAIT_MAX_MS - 1)).toBe("wait")
    })

    it("stops asking once the server's own ceiling has passed", () => {
        // A live flag older than a stream can be is a flag nobody cleared.
        expect(nextRecoveryStep(true, ANSWER_WAIT_MAX_MS)).toBe("give-up")
    })
})

describe("stopAnswer", () => {
    beforeEach(() => {
        vi.mocked(axiosInstance.post).mockReset()
    })

    it("tells the server which session to stop", async () => {
        vi.mocked(axiosInstance.post).mockResolvedValue({})
        await stopAnswer("sess-1")
        expect(axiosInstance.post).toHaveBeenCalledWith(PostEndpointUrl.AIAskStop, { session_id: "sess-1" })
    })

    it("sends nothing when there is no session yet", async () => {
        // Before the first event there is nothing on the server to stop.
        await stopAnswer(undefined)
        expect(axiosInstance.post).not.toHaveBeenCalled()
    })

    it("never throws, because the abort must happen regardless", async () => {
        vi.mocked(axiosInstance.post).mockRejectedValue(new Error("offline"))
        await expect(stopAnswer("sess-1")).resolves.toBeUndefined()
    })
})
