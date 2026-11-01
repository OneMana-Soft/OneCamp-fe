import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

/**
 * The page's one sheet mark (html[data-sheet], components/ui/sheetMark), which
 * app/phone.css C9 reads to keep a phone's toasts off an open sheet. Every
 * sheet primitive sets it through the one hook, counted: a sheet over a sheet
 * keeps it until the last one closes, whichever kind each is (V-111).
 */
const mode = vi.hoisted(() => ({ sheet: true }))
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => mode.sheet }))

const { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } =
  await import("@/components/ui/alert-dialog")
const { OverlaySheet } = await import("@/components/ui/overlaySheet")

afterEach(cleanup)

const marked = () => document.documentElement.getAttribute("data-sheet") === "open"
/** Lets the sheets' observers see a close before the mark is read. */
const settle = () => new Promise((r) => setTimeout(r, 0))

/** The task's sheet on a phone, and a confirm drawn as a sheet over it. */
function Stack({ task, confirm }: { task: boolean; confirm: boolean }) {
  return (
    <>
      <OverlaySheet open={task} onClose={() => {}} label="Book the venue">
        <button type="button">Delete comment</button>
      </OverlaySheet>
      <AlertDialog open={confirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the comment?</AlertDialogTitle>
            <AlertDialogDescription>It goes for everyone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

describe("the page's one sheet mark, with a sheet over a sheet", () => {
  it("stays while the confirm over the task's sheet closes, and goes with the task's sheet", async () => {
    const { rerender } = render(<Stack task confirm />)
    expect(marked()).toBe(true)
    rerender(<Stack task confirm={false} />)
    await settle()
    expect(marked(), "the task's sheet is still open").toBe(true)
    rerender(<Stack task={false} confirm={false} />)
    await waitFor(() => expect(marked()).toBe(false))
  })

  it("stays while the task's sheet closes under the confirm, and goes with the confirm", async () => {
    const { rerender } = render(<Stack task confirm />)
    rerender(<Stack task={false} confirm />)
    await settle()
    expect(marked(), "the confirm is still open").toBe(true)
    rerender(<Stack task={false} confirm={false} />)
    await waitFor(() => expect(marked()).toBe(false))
  })
})
