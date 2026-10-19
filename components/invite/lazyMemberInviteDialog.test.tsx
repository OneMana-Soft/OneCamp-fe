import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { useState } from "react"

// The invite form is fetched the first time it opens (17 Oct 2026, the shell
// diet). Opening it when its code can't come (offline, a dropped connection)
// says so and closes, the page carries on, and the next open tries again.
// With next/dynamic the failure was thrown, and the page went with it.

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

let failing = true
vi.mock("@/components/invite/MemberInviteDialog", () => {
  if (failing) throw new Error("Loading chunk 77 failed")
  return { MemberInviteDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">Invite people</div> : null) }
})

import { LazyMemberInviteDialog } from "@/components/invite/LazyMemberInviteDialog"

function Page() {
  const [open, setOpen] = useState(false)
  return (
    <main>
      <h1>People</h1>
      <button type="button" onClick={() => setOpen(true)}>
        Invite
      </button>
      <LazyMemberInviteDialog open={open} onOpenChange={setOpen} />
    </main>
  )
}

afterEach(() => {
  cleanup()
  toast.mockClear()
  vi.restoreAllMocks()
})

describe("the invite form, fetched when it first opens", () => {
  it("says it couldn't open when its code can't come, and the next open tries again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    render(<Page />)
    act(() => screen.getByRole("button", { name: "Invite" }).click())
    await act(async () => {})
    expect(toast).toHaveBeenCalledWith({ title: "Couldn't open the invite form", description: "Check your connection, then try again.", variant: "destructive" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("heading", { name: "People" })).toBeTruthy()

    failing = false
    act(() => screen.getByRole("button", { name: "Invite" }).click())
    expect((await screen.findByRole("dialog")).textContent).toBe("Invite people")
    expect(toast).toHaveBeenCalledTimes(1)
  })
})
