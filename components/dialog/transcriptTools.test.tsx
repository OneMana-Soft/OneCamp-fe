// zoom-05 Head B: a line's correction in place (1280) and its corrected mark.
// The 390 drawer, the export menu and the server's file name are the e2e's
// (e2e/transcriptExportCorrect.spec.ts).
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const patch = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { patch: (...a: unknown[]) => patch(...a) } }))

import type { TranscriptLine } from "@/types/transcriptLine"
import { CorrectedMark, LineCorrection } from "./transcriptTools"
import { pinTestClock } from "@/lib/testing/testClock"

// Its lines carry dates (a correction's time): the clock is pinned, as every such test's is.
pinTestClock()

const line = { uid: "0x2a", transcript_text: "ship it fried eh", transcript_timestamp: 1, transcript_from: { user_uuid: "u-me" } } as TranscriptLine
const conflict = (words: string) => ({
    isAxiosError: true,
    response: { status: 409, data: { msg: `Asha changed this line to "${words}".`, line: { ...line, transcript_text: words } } },
})

afterEach(() => {
    cleanup()
    patch.mockReset()
})

function editor(onSaved = vi.fn(), onClose = vi.fn()) {
    render(<LineCorrection egressId="eg1" line={line} speaker="Asha Rao" at="0:04" onSaved={onSaved} onClose={onClose} />)
    return { box: screen.getByRole("textbox", { name: /correct this line/i }), onSaved, onClose }
}

describe("a line's correction in place", () => {
    it("Save is off until the words change, and sends {text, was}; 200 updates the line from the reply", async () => {
        const { box, onSaved } = editor()
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
        fireEvent.change(box, { target: { value: "ship it friday" } })
        patch.mockResolvedValueOnce({ data: { line: { ...line, transcript_text: "ship it friday" } } })
        fireEvent.click(screen.getByRole("button", { name: "Save" }))
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ transcript_text: "ship it friday" })))
        expect(patch).toHaveBeenCalledWith("/calls/recordings/eg1/transcript/lines/0x2a", { text: "ship it friday", was: "ship it fried eh" }, expect.anything())
    })

    it("B3: 409 keeps the draft, shows the server's sentence and the new words; a resend uses the new was", async () => {
        const { box } = editor()
        fireEvent.change(box, { target: { value: "ship it Friday" } })
        patch.mockRejectedValueOnce(conflict("ship it friday"))
        fireEvent.click(screen.getByRole("button", { name: "Save" }))
        await screen.findByText('Asha changed this line to "ship it friday".')
        // MAIN M2: the sentence quotes the new words; they aren't said a second time.
        expect(screen.queryByText(/Now:/)).toBeNull()
        expect(screen.getAllByText(/ship it friday/)).toHaveLength(1)
        expect(box).toHaveValue("ship it Friday")
        patch.mockResolvedValueOnce({ data: { line: { ...line, transcript_text: "ship it Friday" } } })
        fireEvent.click(screen.getByRole("button", { name: "Save" }))
        await waitFor(() => expect(patch).toHaveBeenCalledTimes(2))
        expect(patch.mock.calls[1][1]).toEqual({ text: "ship it Friday", was: "ship it friday" })
    })

    it("MAIN M2: a 409 whose sentence doesn't quote the new words shows them once, as Now:", async () => {
        const { box } = editor()
        fireEvent.change(box, { target: { value: "ship it Friday" } })
        patch.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { msg: "Asha changed this line first.", line: { ...line, transcript_text: "ship it friday" } } } })
        fireEvent.click(screen.getByRole("button", { name: "Save" }))
        await screen.findByText("Asha changed this line first.")
        expect(screen.getAllByText(/ship it friday/)).toHaveLength(1)
        expect(screen.getByText("Now: ship it friday")).toBeInTheDocument()
    })

    it("a refusal keeps the draft in plain words", async () => {
        const { box } = editor()
        fireEvent.change(box, { target: { value: "ship it Friday" } })
        patch.mockRejectedValueOnce({ isAxiosError: true, response: { status: 403, data: { msg: "You can't correct this line." } } })
        fireEvent.click(screen.getByRole("button", { name: "Save" }))
        await screen.findByText("You can't correct this line.")
        expect(box).toHaveValue("ship it Friday")
    })

    it("Esc cancels; Ctrl+Enter saves", async () => {
        const { box, onClose } = editor()
        fireEvent.change(box, { target: { value: "ship it friday" } })
        patch.mockResolvedValueOnce({ data: { line: { ...line, transcript_text: "ship it friday" } } })
        fireEvent.keyDown(box, { key: "Enter", ctrlKey: true })
        await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
        fireEvent.keyDown(box, { key: "Escape" })
        expect(onClose).toHaveBeenCalled()
    })
})

describe("the corrected mark (B5)", () => {
    it("what was said shows under the line without a tap; a tap adds who changed it when", () => {
        render(
            <CorrectedMark
                line={{ ...line, transcript_text: "ship it friday", transcript_original_text: "ship it fried eh", transcript_corrected_at: "2026-11-17T05:30:00Z", transcript_corrected_by: { user_uuid: "u-me", user_full_name: "Asha Rao" } }}
            />,
        )
        const mark = screen.getByRole("button", { name: /corrected/i })
        // MAIN M1: what was said shows without a tap; who changed it when is the mark's.
        expect(screen.getByText("Said: ship it fried eh")).toBeInTheDocument()
        expect(screen.queryByText(/^Corrected by Asha Rao, /)).toBeNull()
        fireEvent.click(mark)
        expect(screen.getByText("Said: ship it fried eh")).toBeInTheDocument()
        expect(screen.getByText(/^Corrected by Asha Rao, /)).toBeInTheDocument()
    })
})
