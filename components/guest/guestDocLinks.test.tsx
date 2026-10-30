import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { GuestCollabSession } from "@/services/guestService"
import type { PublicResult } from "@/services/publicApi"

const getGuestCollabSession = vi.fn<(token: string) => Promise<PublicResult<GuestCollabSession>>>()
vi.mock("@/services/guestService", () => ({
  getGuestCollabSession: (token: string) => getGuestCollabSession(token),
  guestCollabToken: vi.fn(),
}))
vi.mock("@/components/guest/GuestDocViewer", () => ({ GuestDocViewer: () => null }))
vi.mock("@/components/guest/GuestDocComments", () => ({ GuestDocComments: () => null }))
const unlock = vi.hoisted(() => ({ unlockPage: vi.fn() }))
vi.mock("@/lib/publish/publish", async (importOriginal) => ({ ...(await importOriginal<object>()), ...unlock }))

import GuestDocPage from "@/app/guest/d/[token]/page"
import { go } from "@/components/publish/publishCards"

async function open(path: string) {
  window.history.replaceState(null, "", path)
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GuestDocPage params={Promise.resolve({ token: "tok-123" })} />
      </Suspense>,
    )
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  getGuestCollabSession.mockReset()
  unlock.unlockPage.mockReset()
  window.history.replaceState(null, "", "/")
})

// Every doc link already sent keeps working, each as it should open.
describe("a doc link already sent, /guest/d/<token>", () => {
  it("opens a view link on the server's own page", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    getGuestCollabSession.mockResolvedValue({ ok: true, data: { resource_type: "doc", capability: "view", page_url: "https://api.example.test/public/d/tok-123" } as GuestCollabSession })
    await open("/guest/d/tok-123")
    await waitFor(() => expect(to).toHaveBeenCalledWith("https://api.example.test/public/d/tok-123"))
    expect(document.querySelector("[data-guest-doc-paper]")).toBeNull()
  })

  it("opens a comment link in the app, as before", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    getGuestCollabSession.mockResolvedValue({ ok: true, data: { collab_token: "jwt", document_name: "doc-1", resource_type: "doc", resource_id: "doc-1", capability: "comment", title: "Launch" } })
    await open("/guest/d/tok-123")
    await screen.findByText("Can comment")
    expect(document.querySelector("[data-guest-doc-paper]")).not.toBeNull()
    expect(to).not.toHaveBeenCalled()
  })

  it("asks a password page's password, and opens it with its unlock", async () => {
    const to = vi.spyOn(go, "to").mockImplementation(() => {})
    unlock.unlockPage.mockResolvedValue({ ok: true, data: { token: "3.99.sig", url: "https://api.example.test/public/d/tok-123?k=3.99.sig", expires_in: 43200 } })
    await open("/guest/d/tok-123?unlock=1")
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "open sesame" } })
    fireEvent.click(screen.getByRole("button", { name: "Open the page" }))
    await waitFor(() => expect(to).toHaveBeenCalledWith("https://api.example.test/public/d/tok-123?k=3.99.sig"))
    expect(unlock.unlockPage).toHaveBeenCalledWith({ token: "tok-123" }, "open sesame")
    expect(getGuestCollabSession).not.toHaveBeenCalled()
  })
})
