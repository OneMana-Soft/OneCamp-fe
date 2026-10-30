import { afterEach, describe, expect, it, vi } from "vitest"

// Copy address on a link (docs F1b) copies as every copy in the app does
// (hooks/useCopyToClipboard): an install served over http has no clipboard
// API, and the address wasn't copied there (code review of F1b).

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: {} }))

import { copyLinkAddress } from "./fileActions"

const execCommand = (copied: boolean | Error) =>
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => {
      if (copied instanceof Error) throw copied
      return copied
    }),
  })

afterEach(() => {
  toast.mockClear()
  vi.restoreAllMocks()
})

describe("a link's address, copied", () => {
  it("copies on an install served over http, where the browser has no clipboard API", async () => {
    execCommand(true)
    await copyLinkAddress("https://www.figma.com/file/abc")
    expect(document.execCommand).toHaveBeenCalledWith("copy")
    expect(toast).toHaveBeenCalledWith({ title: "Address copied" })
  })

  it("says it wasn't copied when the browser refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    execCommand(new Error("denied"))
    await copyLinkAddress("https://www.figma.com/file/abc")
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "The address wasn't copied", description: "Your browser didn't allow it. Copy it from the link instead." })
  })
})
