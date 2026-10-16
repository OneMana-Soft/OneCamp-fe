import { Suspense } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

// A guest page wears the workspace's identity hue: a thin band across its top
// and the type icon on a tile in that hue. The icon sat on an orange tile, and
// orange is for the one thing to press.
const getGuestCollabSession = vi.fn()
const listGuestDocComments = vi.fn()
vi.mock("@/services/guestService", () => ({
  getGuestCollabSession: (token: string) => getGuestCollabSession(token),
  guestCollabToken: vi.fn(),
  listGuestDocComments: (token: string) => listGuestDocComments(token),
  createGuestDocComment: vi.fn(),
}))
vi.mock("@/components/guest/GuestDocViewer", () => ({ GuestDocViewer: () => null }))

import { GUEST_HUE, GuestPageSkeleton } from "./guestUi"
import { PublicGone } from "./publicStates"
import { GuestDocComments } from "./GuestDocComments"
import GuestDocPage from "@/app/guest/d/[token]/page"

const HUE = HUE_CLASS[GUEST_HUE]
const band = () => document.querySelector("[data-guest-band]")

describe("the workspace's hue on a guest page", () => {
  afterEach(() => cleanup())

  it("is the workspace's own, the same on the server and in the browser", () => {
    expect(GUEST_HUE).toBe(hueFor(process.env.NEXT_PUBLIC_APP_URL || "onecamp"))
  })

  it("runs a band across the top of a shared doc, and puts the workspace mark in its hue", async () => {
    getGuestCollabSession.mockResolvedValue({ ok: true, data: { collab_token: "jwt", document_name: "doc-1", resource_type: "doc", resource_id: "doc-1", capability: "view", title: "Launch brief" } })
    listGuestDocComments.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <GuestDocPage params={Promise.resolve({ token: "tok" })} />
        </Suspense>,
      )
    })
    expect(band()!.className).toContain(HUE)
    const tile = document.querySelector("[data-workspace-mark]")!
    expect(tile.className).toContain(HUE)
    expect(tile.className).not.toMatch(/bg-primary/)
  })

  it("keeps the band while the page loads and on a dead link, so nothing moves", () => {
    render(<GuestPageSkeleton label="Opening the link…" />)
    expect(band()!.className).toContain(HUE)
    cleanup()
    render(<PublicGone surface="guest-channel" noun="shared channel" />)
    expect(band()!.className).toContain(HUE)
  })

  it("colours a guest's initial as the app colours anyone without a photo", async () => {
    listGuestDocComments.mockResolvedValue({ ok: true, data: { capability: "view", comments: [{ id: "c1", guest_name: "Jordan Ellis", body: "Footer wording, please.", created_at: "2026-10-09T10:00:00Z" }] } })
    await act(async () => {
      render(<GuestDocComments token="tok" />)
    })
    const initial = screen.getByText("JE")
    expect(initial.className).toContain(HUE_CLASS[hueFor("Jordan Ellis")])
    expect(initial.className).toContain("avatar-person")
  })
})
