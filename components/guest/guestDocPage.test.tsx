import { Suspense } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { GuestCollabSession } from "@/services/guestService"
import type { PublicResult } from "@/services/publicApi"

const getGuestCollabSession = vi.fn<(token: string) => Promise<PublicResult<GuestCollabSession>>>()
vi.mock("@/services/guestService", () => ({
  getGuestCollabSession: (token: string) => getGuestCollabSession(token),
  guestCollabToken: vi.fn(),
}))
// The live document and its comments are beside the point here.
vi.mock("@/components/guest/GuestDocViewer", () => ({ GuestDocViewer: () => null }))
vi.mock("@/components/guest/GuestDocComments", () => ({ GuestDocComments: () => null }))

import GuestDocPage from "@/app/guest/d/[token]/page"

const session: GuestCollabSession = { collab_token: "jwt", document_name: "doc-1", resource_type: "doc", resource_id: "doc-1", capability: "view" }

async function open() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GuestDocPage params={Promise.resolve({ token: "tok" })} />
      </Suspense>,
    )
  })
}

describe("a doc shared with a guest", () => {
  afterEach(() => cleanup())

  it("is headed with its name", async () => {
    getGuestCollabSession.mockResolvedValue({ ok: true, data: { ...session, title: "Launch brief" } })
    await open()
    expect(screen.getByRole("heading", { name: "Launch brief" })).toBeInTheDocument()
  })

  it("says it's a shared document when it has no name", async () => {
    getGuestCollabSession.mockResolvedValue({ ok: true, data: session })
    await open()
    expect(screen.getByRole("heading", { name: "Shared document" })).toBeInTheDocument()
  })
})
