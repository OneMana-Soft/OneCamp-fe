import { act, render } from "@testing-library/react"
import { useReducer } from "react"
import { useRouter } from "next/navigation"
import { describe, expect, it } from "vitest"
import { AppRouterProvider, inPlace, useAppRouter, type AppRouter } from "./appRouter"
import { addressLater } from "./addressLater"
import { renderAtAddress } from "@/lib/testing/nextAddress"

// Next's useRouter() (16.3) reads LayoutRouterContext, which takes a new value
// on every address write, history.replaceState included: each caller draws
// again whenever any part of the address moves. A calendar writes its date on
// each press of J, a list its filter, a page its tab, so every component that
// only navigates drew again with them (the shell, B1's event cards: 243 to
// 809). useAppRouter hands out the router's moves without the address.
//
// AppRouterProvider sits at the root of every page (components/providers/
// ClientProviders): it alone draws again when the address moves, and nothing
// below it does. Next's moves are one instance's (publicAppRouterInstance),
// so it hands out the first it gets; outside it (a test), useAppRouter is
// Next's own. Read the address itself with usePathname or useSearchParams,
// where it is needed. The shell and the lists navigate this way
// (app/app/shellAddress.test.ts).
//
// A list writes its keys into the address a moment after they change
// (addressLater), and that write is a navigation too: Next keeps only the
// latest, so a write landing after a move the app made would cancel it. The
// provider's push and replace run the writes still waiting first.
//
// The module is kept short, its reasons here: every route that navigates
// carries it, and the route ceilings count its bytes.

describe("useAppRouter", () => {
  it("draws a component that navigates once, whatever the address does", () => {
    let draws = 0
    function Navigates() {
      useAppRouter()
      draws++
      return null
    }
    const at = renderAtAddress(<AppRouterProvider><Navigates /></AppRouterProvider>, "/app/calendar?date=2026-10-21")
    expect(draws).toBe(1)
    act(() => at.go("/app/calendar?date=2026-10-22"))
    act(() => at.go("/app/calendar?date=2026-10-22&view=week"))
    act(() => at.go("/app/home"))
    expect(draws).toBe(1)
  })

  it("is needed: Next's own useRouter draws its caller again on a query-only write", () => {
    let draws = 0
    function Navigates() {
      useRouter()
      draws++
      return null
    }
    const at = renderAtAddress(<Navigates />, "/app/calendar?date=2026-10-21")
    act(() => at.go("/app/calendar?date=2026-10-22"))
    expect(draws).toBe(2)
  })

  it("hands out the same moves on every draw, and they move Next's router", () => {
    const seen: AppRouter[] = []
    let redraw = () => {}
    function Navigates() {
      seen.push(useAppRouter())
      redraw = useReducer((n: number) => n + 1, 0)[1] as () => void
      return null
    }
    const at = renderAtAddress(<AppRouterProvider><Navigates /></AppRouterProvider>, "/app/home")
    act(() => redraw())
    act(() => at.go("/app/home?tab=done"))
    act(() => redraw())
    expect(seen.length).toBe(3)
    expect(new Set(seen).size).toBe(1)
    const r = seen[0]
    r.push("/app/channel/c1", { scroll: false })
    r.replace("/app/home?tab=all")
    r.prefetch("/app/settings")
    r.back()
    r.forward()
    r.refresh()
    expect(at.router.push).toHaveBeenCalledWith("/app/channel/c1", { scroll: false })
    expect(at.router.replace).toHaveBeenCalledWith("/app/home?tab=all")
    expect(at.router.prefetch).toHaveBeenCalledWith("/app/settings")
    expect(at.router.back).toHaveBeenCalledTimes(1)
    expect(at.router.forward).toHaveBeenCalledTimes(1)
    expect(at.router.refresh).toHaveBeenCalledTimes(1)
  })

  it("writes the address that waits before a push or replace: written after, it would cancel the move", () => {
    const done: string[] = []
    const seen: AppRouter[] = []
    function Navigates() {
      seen.push(useAppRouter())
      return null
    }
    const at = renderAtAddress(<AppRouterProvider><Navigates /></AppRouterProvider>, "/app/myTask")
    at.router.push.mockImplementation(() => void done.push("push"))
    at.router.replace.mockImplementation(() => void done.push("replace"))
    const r = seen[0]
    const stops = [addressLater(() => done.push("search"), 300)]
    r.push("/app/inbox")
    stops.push(addressLater(() => done.push("sort"), 300))
    r.replace("/app/myTask?tab=board")
    stops.forEach((stop) => stop())
    expect(done).toEqual(["search", "push", "sort", "replace"])
  })

  it("makes no move a taker takes in place, and writes nothing that waits for it (asana-12 (a))", () => {
    const done: string[] = []
    const seen: AppRouter[] = []
    function Navigates() {
      seen.push(useAppRouter())
      return null
    }
    const at = renderAtAddress(<AppRouterProvider><Navigates /></AppRouterProvider>, "/app/project/p1")
    const take = (href: string) => href.startsWith("/app/task/")
    inPlace.add(take)
    const stop = addressLater(() => done.push("search"), 300)
    try {
      const r = seen[0]
      r.push("/app/task/t1")
      r.replace("/app/task/t1")
      expect(at.router.push).not.toHaveBeenCalled()
      expect(at.router.replace).not.toHaveBeenCalled()
      expect(done).toEqual([])
      // A move no taker takes is Next's, as ever.
      r.push("/app/inbox")
      expect(at.router.push).toHaveBeenCalledWith("/app/inbox")
      expect(done).toEqual(["search"])
    } finally {
      stop()
      inPlace.delete(take)
    }
  })

  it("draws nothing below the provider again when the address moves", () => {
    let draws = 0
    function Page() {
      draws++
      return null
    }
    const at = renderAtAddress(<AppRouterProvider><Page /></AppRouterProvider>, "/app/home")
    act(() => at.go("/app/home?x=1"))
    expect(draws).toBe(1)
  })

  it("is Next's router outside the provider (a component drawn on its own)", () => {
    let got: AppRouter | null = null
    function Navigates() {
      got = useAppRouter()
      return null
    }
    const at = renderAtAddress(<Navigates />, "/app/home")
    got!.push("/app/ai")
    expect(at.router.push).toHaveBeenCalledWith("/app/ai")
  })

  it("asks for Next's app router outside the provider, as useRouter does", () => {
    function Navigates() {
      useAppRouter()
      return null
    }
    expect(() => render(<Navigates />)).toThrow(/app router/)
  })
})
