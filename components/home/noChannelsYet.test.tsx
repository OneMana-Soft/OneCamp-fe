import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// A member in no channel used to see nothing about channels on Home. Now Home
// offers the channel new members start in, and the list to browse.

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
const state = vi.hoisted(() => ({
  sidenav: undefined as unknown,
  inSidebar: [] as unknown[],
  suggested: null as unknown,
}))
vi.mock("@/hooks/useHydrateUserSidebar", () => ({ useSidenav: () => ({ data: state.sidenav }) }))
vi.mock("react-redux", () => ({
  useSelector: (pick: (s: unknown) => unknown) => pick({ users: { userSidebar: { userChannels: state.inSidebar } } }),
}))
const fetched = vi.hoisted(() => ({ urls: [] as string[] }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    fetched.urls.push(url)
    return { data: url ? { data: state.suggested } : undefined }
  },
}))
const join = vi.hoisted(() => ({ makeRequest: vi.fn(), isSubmitting: false }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => join }))

import { NoChannelsYet } from "./NoChannelsYet"

const GENERAL = { ch_uuid: "6f1c3a52-9d3e-4c9e-a7b1-2f0e5d4c3b2a", ch_name: "general" }

beforeEach(() => {
  state.sidenav = { data: { user_channels: [] } }
  state.inSidebar = []
  state.suggested = GENERAL
  fetched.urls = []
  router.push.mockReset()
  join.makeRequest.mockReset()
  join.makeRequest.mockImplementation(async (req: { onSuccess?: () => void }) => req.onSuccess?.())
})
afterEach(cleanup)

describe("Home for a member in no channel", () => {
  it("offers the channel new members start in, and opens it ready to write", async () => {
    render(<NoChannelsYet />)
    expect(screen.getByRole("heading", { name: "You're not in any channels yet" })).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Join #general" })))
    expect(join.makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { channel_uuid: GENERAL.ch_uuid } }))
    expect(router.push).toHaveBeenCalledWith(`/app/channel/${GENERAL.ch_uuid}?compose=1`)
  })

  it("offers the channel list too, and only that when there is none to suggest", () => {
    state.suggested = null
    render(<NoChannelsYet />)
    expect(screen.getByRole("link", { name: "Browse channels" }).getAttribute("href")).toBe("/app/channel?tab=join")
    expect(screen.queryByRole("button", { name: /^Join #/ })).toBeNull()
  })

  it("says nothing to a member of a channel, or before it knows", () => {
    state.sidenav = { data: { user_channels: [GENERAL] } }
    const { container, rerender } = render(<NoChannelsYet />)
    expect(container.textContent).toBe("")
    state.sidenav = undefined
    rerender(<NoChannelsYet />)
    expect(container.textContent).toBe("")
    expect(fetched.urls.every((u) => u === "")).toBe(true)
  })
})
