import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/guestService", () => ({
  createGuestLink: vi.fn(),
  guestResourceLink: () => "https://acme.test/guest/t/tok",
  resourceGuestLinksKey: () => "links",
  turnOffGuestLink: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { ShareTableDialog } from "./ShareTableDialog"

describe("a table's Share dialog", () => {
  afterEach(cleanup)

  it("is the share dialog's shell: the link as its card, and its actions in the footer", () => {
    const onClose = vi.fn()
    render(<ShareTableDialog tableId="t1" tableName="Vendors" canShare onClose={onClose} />)
    const dialog = screen.getByRole("dialog", { name: "Share “Vendors”" })
    // Anyone with the link: a switch, Off until turned on; a guest only reads a table.
    expect(screen.getByRole("switch", { name: "Anyone with the link" }).getAttribute("aria-checked")).toBe("false")
    // Nothing in the body is a primary action; Copy link and Done sit in the footer.
    expect(dialog.querySelector('[data-guest-link-card=""]')).not.toBeNull()
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
