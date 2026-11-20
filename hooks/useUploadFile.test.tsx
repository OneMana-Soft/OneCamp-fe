import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

// V-1160: a video the browser can't read stopped its own upload. Its size is
// measured first, and that measure's "Failed to load video" ended the upload
// before it was sent, unhandled. The measure now settles to 0 by 0, so the file
// goes up with no size, as a comment's does.

const dispatch = vi.fn()
vi.mock("react-redux", () => ({ useDispatch: () => dispatch, useStore: () => ({ getState: () => ({}) }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({ upload_limit_bytes: 0, upload_limit_mb: 0 }) }))
const postUpload = vi.fn(async () => ({ data: { object_uuid: "obj-1" } }))
vi.mock("@/lib/upload", async (original) => ({ ...(await original<typeof import("@/lib/upload")>()), postUpload: (...a: unknown[]) => postUpload(...(a as [])) }))
// The browser can't read the clip: its video element errors as soon as it has a source.
URL.createObjectURL = vi.fn(() => "blob:clip")
URL.revokeObjectURL = vi.fn()
const createElement = document.createElement.bind(document)
vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
  if (tag !== "video") return createElement(tag)
  const video = { onerror: null as null | (() => void), set src(_: string) { queueMicrotask(() => video.onerror?.()) } }
  return video
}) as typeof document.createElement)

const { useUploadFile } = await import("./useUploadFile")

describe("useUploadFile", () => {
  it("still sends a video it can't measure, with no size", async () => {
    const { result } = renderHook(() => useUploadFile())
    const clip = new File(["not a video"], "clip.mp4", { type: "video/mp4" })
    await act(() => result.current.makeRequestToUploadToProject([clip], "p1"))
    expect(postUpload).toHaveBeenCalledTimes(1)
    const sent = dispatch.mock.calls.map(([a]) => a.payload?.filesUploaded).find(Boolean)
    expect(sent).toMatchObject({ attachment_file_name: "clip.mp4", attachment_width: 0, attachment_height: 0 })
  })
})
