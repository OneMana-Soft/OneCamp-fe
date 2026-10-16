import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// "Notifications" on the phone's doc sheet (QA DSA-06, 14 Oct 2026): More's
// submenu as a sheet of its own, the same three choices and the same rule
// (useFollowChoice), chosen at a tap.

const setFollow = vi.fn(async () => ({}))
vi.mock("@/services/followService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/followService")>()),
  setFollow: (...a: unknown[]) => setFollow(...(a as [])),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { msg: "", data: { resource_kind: "doc", resource_uuid: "d1", mode: "mentions", chosen: false, default: "mentions" } }, isError: undefined }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import FollowDialog from "./FollowDialog"

afterEach(() => {
  cleanup()
  setFollow.mockClear()
})

describe("Notifications as a sheet", () => {
  it("offers the three choices, the current one checked, the default named", () => {
    render(<FollowDialog docId="d1" onClose={() => {}} />)
    const choices = screen.getAllByRole("radio")
    expect(choices.map((c) => c.textContent)).toEqual([
      expect.stringContaining("All activity"),
      expect.stringContaining("Replies and mentions (default)"),
      expect.stringContaining("Only @mentions"),
    ])
    expect(choices.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "true", "false"])
  })

  it("chooses at a tap", async () => {
    render(<FollowDialog docId="d1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: /All activity/ }))
    await waitFor(() => expect(setFollow).toHaveBeenCalledWith("d1", "all"))
  })
})
