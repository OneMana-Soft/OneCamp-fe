import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({ access: undefined as unknown, transfer: vi.fn(), toasts: [] as { title?: string }[] }))

vi.mock("./chrome/useDoc", () => ({ useDoc: () => ({ doc_title: "Launch notes" }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: hoisted.access ? { data: hoisted.access } : undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-me" } } }),
}))
vi.mock("@/services/docAccessService", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/docAccessService")>()), transferDoc: hoisted.transfer }))
vi.mock("@/services/docChromeService", () => ({
  searchPeople: () => Promise.resolve([{ user_uuid: "u-me", user_name: "Me" }, { user_uuid: "u-asha", user_name: "Asha Rao", user_email_id: "asha@acme.test" }]),
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: () => Promise.resolve() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => hoisted.toasts.push(t) }))

import OwnerControl from "./OwnerControl"

beforeEach(() => {
  hoisted.transfer.mockReset().mockResolvedValue(undefined)
  hoisted.toasts.length = 0
})
afterEach(cleanup)

describe("handing a doc on (A5 §4)", () => {
  it("lets its owner choose someone else in the workspace, who owns it from then on", async () => {
    hoisted.access = { owner: true, level: "full", sharing: { recoveries: [{ id: "r", reason: "Left the company", created_at: "2026-10-09T10:00:00Z" }] } }
    const close = vi.fn()
    render(<OwnerControl docId="o1" onClose={close} />)
    expect(screen.getByText("Recovered by a workspace admin")).toBeTruthy()
    expect(screen.getByText(/Left the company/)).toBeTruthy()
    fireEvent.change(screen.getByRole("searchbox", { name: "Search people" }), { target: { value: "as" } })
    // The owner isn't offered to themselves.
    const asha = await screen.findByRole("button", { name: /Asha Rao/ }, { timeout: 2000 })
    expect(screen.queryByRole("button", { name: /^Me$/ })).toBeNull()
    fireEvent.click(asha)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Transfer to Asha Rao" })))
    expect(hoisted.transfer).toHaveBeenCalledWith("o1", "u-asha")
    expect(hoisted.toasts[0]?.title).toBe("Asha Rao owns “Launch notes” now")
    expect(close).toHaveBeenCalled()
  })

  it("tells anyone else only the owner can", () => {
    hoisted.access = { owner: false, level: "full", sharing: {} }
    render(<OwnerControl docId="o1" onClose={() => {}} />)
    expect(screen.getByRole("alert").textContent).toBe("Only the doc's owner can hand it on.")
    expect((screen.getByRole("button", { name: "Transfer" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
