import { afterEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"

// Every state setter the readers below are handed, wrapped so a test sees who it set and whether that reader was
// still mounted then: a setter run after its reader is gone is a listener left behind (V-1227).
const probe = vi.hoisted(() => ({ as: "", alive: new Set<string>(), late: [] as string[], heard: [] as Array<{ who: string; value: unknown }> }))
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  const wrapped = new WeakMap<object, (value: unknown) => void>()
  const useState = ((init: unknown) => {
    const [state, set] = actual.useState(init)
    const who = probe.as
    if (!wrapped.has(set))
      wrapped.set(set, (value: unknown) => {
        probe.heard.push({ who, value })
        if (!probe.alive.has(who)) probe.late.push(who)
        set(value)
      })
    return [state, wrapped.get(set)]
  }) as typeof actual.useState
  return { ...actual, default: { ...actual, useState }, useState }
})

import { useKeptRead } from "@/lib/lazy/useKeptRead"

// A read for a lazy view (lib/lazy/useKeptRead): what was kept for its path at once, then the server's; keep() takes
// a write's answer as the read's, for every reader of that path mounted on the page, and for no reader of another.

type Got = { n: number }
const keeps = new Map<string, (got: Got) => void>()

function Reader({ id, path, load }: { id: string; path: string | null; load: () => Promise<Got> }) {
  probe.as = id
  const { data, keep } = useKeptRead<Got>(path, load)
  keeps.set(id, keep)
  React.useEffect(() => {
    probe.alive.add(id)
    return () => void probe.alive.delete(id)
  }, [id])
  return <p data-testid={id}>{data ? String(data.n) : "none"}</p>
}

const answers = (n: number) => vi.fn(() => Promise.resolve({ n }))
const shows = (id: string) => screen.getByTestId(id).textContent

afterEach(() => {
  cleanup()
  keeps.clear()
  probe.late.length = 0
  probe.heard.length = 0
})

describe("useKeptRead", () => {
  it("a keep in one reader reaches every mounted reader of its path, with no read again, and no reader of another path", async () => {
    const rota = answers(1)
    const other = answers(9)
    render(
      <>
        <Reader id="settings" path="/kept/rota" load={rota} />
        <Reader id="queue" path="/kept/rota" load={rota} />
        <Reader id="elsewhere" path="/kept/other" load={other} />
      </>,
    )
    await waitFor(() => expect([shows("settings"), shows("queue"), shows("elsewhere")]).toEqual(["1", "1", "9"]))

    act(() => keeps.get("settings")!({ n: 5 }))
    expect(shows("settings")).toBe("5")
    expect(shows("queue")).toBe("5")
    expect(shows("elsewhere")).toBe("9")
    expect(rota).toHaveBeenCalledTimes(2)
    expect(other).toHaveBeenCalledTimes(1)
  })

  it("a reader that mounts after a keep draws the kept answer at once, before its own read answers", async () => {
    let answer: (got: Got) => void = () => {}
    const slow = vi.fn(() => new Promise<Got>((resolve) => (answer = resolve)))
    render(<Reader id="first" path="/kept/late" load={slow} />)
    act(() => keeps.get("first")!({ n: 7 }))
    render(<Reader id="later" path="/kept/late" load={slow} />)
    expect(shows("later")).toBe("7")
    expect(slow).toHaveBeenCalledTimes(2)
    await act(async () => answer({ n: 7 }))
    expect(shows("later")).toBe("7")
  })

  it("a reader moved to another path hears its new path only", async () => {
    const four = answers(4)
    const six = answers(6)
    const view = render(
      <>
        <Reader id="mover" path="/kept/a" load={four} />
        <Reader id="stay" path="/kept/a" load={four} />
      </>,
    )
    await waitFor(() => expect(shows("stay")).toBe("4"))
    view.rerender(
      <>
        <Reader id="mover" path="/kept/b" load={six} />
        <Reader id="stay" path="/kept/a" load={four} />
      </>,
    )
    await waitFor(() => expect(shows("mover")).toBe("6"))

    act(() => keeps.get("stay")!({ n: 8 }))
    expect(shows("stay")).toBe("8")
    expect(shows("mover")).toBe("6")
  })

  it("a reader gone from the page is never set again, its listener gone with it, under StrictMode too", async () => {
    const one = answers(1)
    const view = render(
      <React.StrictMode>
        <Reader id="kept" path="/kept/strict" load={one} />
        <Reader id="gone" path="/kept/strict" load={one} />
      </React.StrictMode>,
    )
    await waitFor(() => expect([shows("kept"), shows("gone")]).toEqual(["1", "1"]))
    view.rerender(
      <React.StrictMode>
        <Reader id="kept" path="/kept/strict" load={one} />
      </React.StrictMode>,
    )
    probe.heard.length = 0
    const warn = vi.spyOn(console, "error").mockImplementation(() => {})

    act(() => keeps.get("kept")!({ n: 3 }))
    expect(shows("kept")).toBe("3")
    expect(probe.late).toEqual([])
    // One setter run per mounted reader: StrictMode's second mount left no second listener behind.
    expect(probe.heard.filter((h) => (h.value as Got | undefined)?.n === 3).map((h) => h.who)).toEqual(["kept"])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
