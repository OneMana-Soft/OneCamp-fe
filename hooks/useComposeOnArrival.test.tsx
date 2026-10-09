import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A new member lands on their first channel with compose=1: the message box
// takes the cursor there once, the address loses the parameter, and nothing
// else is affected.

const nav = vi.hoisted(() => ({ search: "", path: "/" }))
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.path,
}))

import { useComposeOnArrival } from "./useComposeOnArrival"

function Probe({ channelId }: { channelId: string }) {
  return <span>{useComposeOnArrival(channelId) ? "focus" : "no focus"}</span>
}

function at(path: string, search: string) {
  nav.path = path
  nav.search = search
  window.history.replaceState(null, "", `${path}${search ? `?${search}` : ""}`)
}

afterEach(() => cleanup())

describe("arriving in a channel to write", () => {
  it("focuses the message box and takes compose=1 out of the address", async () => {
    at("/app/channel/abc", "compose=1&tab=all")
    render(<Probe channelId="abc" />)
    expect(await screen.findByText("focus")).toBeTruthy()
    expect(window.location.search).toBe("?tab=all")
  })

  it("leaves a channel opened any other way alone", () => {
    at("/app/channel/abc", "")
    render(<Probe channelId="abc" />)
    expect(screen.getByText("no focus")).toBeTruthy()
  })

  it("is not taken by a channel beside another page", () => {
    at("/app/channel/abc", "compose=1")
    render(<Probe channelId="xyz" />)
    expect(screen.getByText("no focus")).toBeTruthy()
    expect(window.location.search).toBe("?compose=1")
  })
})
