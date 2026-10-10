import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// A file's thumbnail opens it. It was a div with a click handler: no focus,
// no name. It is a button now, out of the tab order only where something
// beside it opens the same file.

vi.mock("@/hooks/useFetch", () => ({ useMediaFetch: (url: string) => ({ data: url ? { url: "https://files.example/a.pdf" } : undefined }) }))
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <img alt={p.alt} /> }))

const { AttachmentIcon } = await import("./attachmentIcon")

afterEach(cleanup)

describe("AttachmentIcon", () => {
  it("is a button named after its file, that opens it", () => {
    const open = vi.fn()
    render(<AttachmentIcon fileName="brief.pdf" getUrl="/ch/getFile/c1/a1" attachmentType="document" attachmentOnCLick={open} />)
    const button = screen.getByRole("button", { name: "Open brief.pdf" })
    fireEvent.click(button)
    expect(open).toHaveBeenCalledTimes(1)
    expect(button.getAttribute("tabindex")).toBeNull()
  })

  it("is disabled while there is nothing to open yet", () => {
    render(<AttachmentIcon fileName="brief.pdf" attachmentType="document" attachmentOnCLick={() => {}} />)
    expect((screen.getByRole("button", { name: "Open brief.pdf" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("leaves the tab order when told something beside it opens the file", () => {
    render(<AttachmentIcon fileName="brief.pdf" getUrl="/x" attachmentType="document" attachmentOnCLick={() => {}} focusable={false} />)
    expect(screen.getByRole("button", { name: "Open brief.pdf" }).getAttribute("tabindex")).toBe("-1")
  })
})
