import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

// A comment draft's files (B7). N41: a file still uploading when its comment
// was sent finished into the next draft and went out with the next comment.
// N45: nothing checked a file's size before uploading it.

vi.mock("@/hooks/useClientConfig", () => ({
    useClientConfig: () => ({ upload_limit_mb: 10, upload_limit_bytes: 10 * 1024 * 1024 }),
}))
vi.mock("@/lib/utils/file/getMediaDimensions", () => ({ getMediaDimensions: async () => ({ width: 0, height: 0 }) }))

const { useCommentDraft, MAX_FILES } = await import("./useCommentDraft")

type Upload = { file: File; ok(id: string): void; no(e: unknown): void; signal: AbortSignal; progress(p: number): void }

function uploads() {
    const waiting: Upload[] = []
    const fn = vi.fn((_doc: string, file: File, progress: (p: number) => void, signal: AbortSignal) => new Promise<string>((ok, no) => waiting.push({ file, ok, no, signal, progress })))
    return { fn, waiting }
}

const file = (name: string, size = 10) => {
    const f = new File(["x"], name, { type: "image/png" })
    Object.defineProperty(f, "size", { value: size })
    return f
}

const flush = () => act(async () => {
    await new Promise((r) => setTimeout(r, 0))
})

describe("a comment draft's files", () => {
    it("never lets a file still uploading when its comment went join the next one (N41)", async () => {
        const up = uploads()
        const { result } = renderHook(() => useCommentDraft("d1", up.fn))
        act(() => result.current.add([file("late.png")]))
        await flush()
        expect(result.current.uploading).toBe(true)
        expect(result.current.attachments).toEqual([])

        // Sent (or thrown away): a new draft; what was on its way stops.
        act(() => result.current.clear())
        expect(up.waiting[0].signal.aborted).toBe(true)
        expect(result.current.files).toEqual([])

        // It finishes anyway: the new draft doesn't take it.
        await act(async () => up.waiting[0].ok("u-late"))
        expect(result.current.files).toEqual([])
        expect(result.current.attachments).toEqual([])

        act(() => result.current.add([file("next.png")]))
        await flush()
        up.waiting[1].progress(40)
        await flush()
        expect(result.current.files[0]).toMatchObject({ name: "next.png", progress: 40 })
        await act(async () => up.waiting[1].ok("u-next"))
        expect(result.current.uploading).toBe(false)
        expect(result.current.attachments.map((a) => [a.attachment_uuid, a.attachment_file_name])).toEqual([["u-next", "next.png"]])
    })

    it("refuses a file over the workspace's limit before uploading it, naming the limit (N45)", async () => {
        const up = uploads()
        const { result } = renderHook(() => useCommentDraft("d1", up.fn))
        act(() => result.current.add([file("film.mov", 11 * 1024 * 1024), file("ok.png")]))
        await flush()
        expect(up.fn).toHaveBeenCalledTimes(1)
        expect(up.fn.mock.calls[0][1].name).toBe("ok.png")
        expect(result.current.refused).toMatch(/^film\.mov is 11(\.0)? MB, over the 10 MB upload limit for this workspace\.$/)
    })

    it("takes at most as many files as one comment carries, and says so", async () => {
        const up = uploads()
        const { result } = renderHook(() => useCommentDraft("d1", up.fn))
        act(() => result.current.add(Array.from({ length: MAX_FILES + 2 }, (_, i) => file(`f${i}.png`))))
        await flush()
        expect(up.fn).toHaveBeenCalledTimes(MAX_FILES)
        expect(result.current.refused).toBe(`A comment takes at most ${MAX_FILES} files.`)
    })

    it("counts two quick picks together, before the draft draws again", async () => {
        const up = uploads()
        const { result } = renderHook(() => useCommentDraft("doc-1", up.fn))
        act(() => {
            result.current.add(Array.from({ length: MAX_FILES - 1 }, (_, i) => file(`a${i}.png`)))
            result.current.add([file("b1.png"), file("b2.png")])
        })
        await flush()
        expect(up.fn).toHaveBeenCalledTimes(MAX_FILES)
        expect(result.current.files).toHaveLength(MAX_FILES)
    })

    it("says why a file couldn't be stored, and lets it be taken off", async () => {
        const up = uploads()
        const { result } = renderHook(() => useCommentDraft("d1", up.fn))
        act(() => result.current.add([file("a.png")]))
        await flush()
        await act(async () => up.waiting[0].no({ response: { data: { msg: "The server's storage is full." } } }))
        expect(result.current.files[0].error).toBe("The server's storage is full.")
        expect(result.current.uploading).toBe(false)
        act(() => result.current.remove(result.current.files[0].key))
        expect(result.current.files).toEqual([])
    })

    it("stops what it was uploading when the composer goes", async () => {
        const up = uploads()
        const { result, unmount } = renderHook(() => useCommentDraft("d1", up.fn))
        act(() => result.current.add([file("a.png")]))
        await flush()
        unmount()
        expect(up.waiting[0].signal.aborted).toBe(true)
    })
})
