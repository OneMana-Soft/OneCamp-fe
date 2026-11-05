import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/guestService", () => ({
  createGuestLink: vi.fn(),
  guestResourceLink: () => "https://acme.test/guest/b/tok",
  resourceGuestLinksKey: (kind: string, id: string) => `links/${kind}/${id}`,
  turnOffGuestLink: vi.fn(),
}))
// Each read answers by its key, as the server would.
const reads = vi.hoisted(() => ({ byKey: {} as Record<string, unknown>, asked: [] as string[] }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) reads.asked.push(url)
    return { data: url ? reads.byKey[url] : undefined, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { pinTestClock } from "@/lib/testing/testClock"
import { GuestLinkSection } from "./GuestLinkSection"

pinTestClock()

const CONFIDENTIAL = { id: "l-c", name: "Confidential", colour: "red", rank: 2, rules: ["no_guest_links", "no_export"] }
const BOARD_ONLY = { id: "l-b", name: "Board only", colour: "sky", rank: 1, rules: ["no_export"] }
const LINK = { id: "g1", capability: "view", expires_at: null, created_at: "2026-11-01T10:00:00Z" }

beforeEach(() => {
  reads.byKey = { "links/board/b-1": { data: [] }, "links/doc/d-1": { data: [] } }
  reads.asked = []
})
afterEach(() => cleanup())

const switchOf = () => screen.getByRole("switch", { name: "Anyone with the link" }) as HTMLButtonElement

describe("a share dialog's external link while a sensitivity label holds guest links back (miro-44 L)", () => {
  it("says the label and the rule, and its switch can't turn a link on", () => {
    reads.byKey["/labels/items/board/b-1"] = { data: CONFIDENTIAL }
    render(<GuestLinkSection card resourceType="board" resourceId="b-1" canShare />)
    expect(screen.getByText("Off · Labelled Confidential")).toBeTruthy()
    const note = document.querySelector("[data-label-held='no_guest_links']")!
    expect(note.textContent).toContain("Labelled Confidential · No guest links")
    expect(note.textContent).toContain("Its owner or a workspace admin can change the label.")
    expect(switchOf().disabled).toBe(true)
  })

  it("leaves a link made before the label went on to be turned off", () => {
    reads.byKey["/labels/items/doc/d-1"] = { data: CONFIDENTIAL }
    reads.byKey["links/doc/d-1"] = { data: [LINK] }
    render(<GuestLinkSection card resourceType="doc" resourceId="d-1" canShare />)
    expect(document.querySelector("[data-label-held]")).toBeNull()
    expect(switchOf().disabled).toBe(false)
    expect(switchOf().getAttribute("aria-checked")).toBe("true")
  })

  it("is as it always was under a label without that rule, or none", () => {
    reads.byKey["/labels/items/board/b-1"] = { data: BOARD_ONLY }
    const { unmount } = render(<GuestLinkSection card resourceType="board" resourceId="b-1" canShare />)
    expect(document.querySelector("[data-label-held]")).toBeNull()
    expect(switchOf().disabled).toBe(false)
    unmount()
    reads.byKey["/labels/items/board/b-1"] = { data: null }
    render(<GuestLinkSection card resourceType="board" resourceId="b-1" canShare />)
    expect(screen.getByText("Off")).toBeTruthy()
    expect(switchOf().disabled).toBe(false)
  })

  it("asks a label only for the kinds that carry one, and only of someone who may share", () => {
    reads.byKey["links/table/t-1"] = { data: [] }
    const { unmount } = render(<GuestLinkSection card resourceType="table" resourceId="t-1" canShare />)
    expect(reads.asked.filter((k) => k.startsWith("/labels"))).toEqual([])
    unmount()
    render(<GuestLinkSection card resourceType="board" resourceId="b-1" canShare={false} />)
    expect(reads.asked.filter((k) => k.startsWith("/labels"))).toEqual([])
  })
})
