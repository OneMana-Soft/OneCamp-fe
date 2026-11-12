import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { walk } from "../../scripts/fluidity/reach.mjs"
import * as Static from "@/components/ui/tooltip"

// RADIX'S PART COMES LATER (FLUIDITY H2, 5 Nov 2026). components/ui/tooltip draws a closed tooltip as its trigger
// alone, and its code is on 75 first loads: Radix's tooltip (components/ui/tooltipBridge) is fetched on idle after
// the first load, or by the first mouse or keys before that. A pointer that came before the code is answered as the
// code lands, on the same node; a chunk that can't come shows no tooltip and no error, and the trigger works on.

const { load, bridge } = vi.hoisted(() => {
  const load = { fails: 0, calls: 0, gate: Promise.resolve() as Promise<void>, at: 0 }
  const bridge = async (importOriginal: <T>() => Promise<T>) => {
    load.calls++
    if (load.fails > 0) {
      load.fails--
      throw new Error("the tooltip's chunk didn't come")
    }
    await load.gate
    const code = await importOriginal<object>()
    load.at = performance.now()
    return code
  }
  return { load, bridge }
})
vi.mock("@/components/ui/tooltipBridge", bridge)

afterEach(cleanup)

const label = () => document.querySelector("[data-radix-popper-content-wrapper] > [data-state$='open']")
const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

type Ui = typeof Static
function Bar({ onClick, ui = Static }: { onClick?: () => void; ui?: Ui }) {
  const { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } = ui
  return (
    <TooltipProvider>
      {[0, 1].map((i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`Tool ${i}`} onClick={onClick}>
              {i}
            </button>
          </TooltipTrigger>
          <TooltipContent>{`Tool ${i} tip`}</TooltipContent>
        </Tooltip>
      ))}
    </TooltipProvider>
  )
}
const tool = (i: number) => screen.getByRole("button", { name: `Tool ${i}` })

/** The tooltip as a page's first finds it, its Radix part not fetched, and that part held until `land()`. */
async function beforeTheCode() {
  let land = () => {}
  load.gate = new Promise<void>((r) => (land = r))
  load.at = 0
  vi.resetModules()
  // A mock's module outlives resetModules: mocking it again drops it, so the code comes again (and waits).
  vi.doMock("@/components/ui/tooltipBridge", bridge)
  const ui = await import("@/components/ui/tooltip")
  return { land, ui }
}

/** When the tooltip's chip is first on screen, to the millisecond (a wait polls). */
const firstShown = () =>
  new Promise<number>((resolve) => {
    const seen = new MutationObserver(() => label() && (seen.disconnect(), resolve(performance.now())))
    seen.observe(document.body, { childList: true, subtree: true, attributes: true })
  })

describe("a tooltip whose code hasn't come", () => {
  it("shows nothing and no error when the code can't come, and its trigger works on", async () => {
    load.fails = 1
    const clicked = vi.fn()
    render(<Bar onClick={clicked} />)
    const node = tool(0)
    act(() => node.focus())
    await waitFor(() => expect(load.calls).toBeGreaterThanOrEqual(1))
    await pause(50)
    expect(label()).toBeNull()
    expect(document.activeElement).toBe(node)
    fireEvent.click(node)
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(tool(0)).toBe(node)
  })

  it("answers a mouse that came before its code as the code lands (its 400 ms are spent), on the same node", async () => {
    let land = () => {}
    load.gate = new Promise<void>((r) => (land = r))
    render(<Bar />)
    const node = tool(0)
    fireEvent.pointerMove(node, { pointerType: "mouse" })
    await pause(600)
    expect(label()).toBeNull()
    expect(node.getAttribute("data-state")).toBe("closed")
    land()
    await waitFor(() => expect(label()?.textContent).toContain("Tool 0 tip"), { timeout: 3000 })
    expect(node.getAttribute("data-state")).toBe("delayed-open")
    expect(node.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
    expect(tool(0)).toBe(node)
    // Here now: the next tooltip draws its part at once, with no second fetch.
    const calls = load.calls
    fireEvent.pointerDown(node, { pointerType: "mouse" })
    fireEvent.pointerLeave(node, { pointerType: "mouse" })
    await waitFor(() => expect(label()).toBeNull())
    fireEvent.pointerMove(tool(1), { pointerType: "mouse" })
    await waitFor(() => expect(label()?.textContent).toContain("Tool 1 tip"), { timeout: 2000 })
    expect(load.calls).toBe(calls)
  })

  // A keyboard user's first Tab on a cold page (FLUIDITY-16, 6 Nov 2026): at 4x CPU the code came after 200 ms and
  // the tooltip let the focus go, so the first Tab showed nothing in 4 or 5 runs of 5.
  it("answers a Tab that came before its code once the code lands, however late", async () => {
    const { land, ui } = await beforeTheCode()
    render(<Bar ui={ui} />)
    const node = tool(0)
    act(() => node.focus())
    await pause(1000)
    expect(label()).toBeNull()
    land()
    await waitFor(() => expect(load.at).toBeGreaterThan(0), { timeout: 3000 })
    await waitFor(() => expect(label()?.textContent).toContain("Tool 0 tip"))
    expect(document.activeElement).toBe(node)
    expect(node.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
    expect(tool(0)).toBe(node)
  })

  it("shows nothing for a Tab that moved on before its code landed, and the next Tab shows it", async () => {
    const { land, ui } = await beforeTheCode()
    render(<Bar ui={ui} />)
    const node = tool(0)
    act(() => node.focus())
    await pause(300)
    act(() => node.blur())
    land()
    await waitFor(() => expect(load.at).toBeGreaterThan(0), { timeout: 3000 })
    await pause(300)
    expect(label()).toBeNull()
    act(() => node.focus())
    await waitFor(() => expect(label()?.textContent).toContain("Tool 0 tip"))
  })

  // A mouse's 400 ms count from its arrival, as Radix's own did: a cold first hover cost the code's time and 400 ms.
  it("opens a mouse's tooltip 400 ms after the mouse came, not 400 ms after its code", async () => {
    const { land, ui } = await beforeTheCode()
    render(<Bar ui={ui} />)
    const shown = firstShown()
    const came = performance.now()
    fireEvent.pointerMove(tool(0), { pointerType: "mouse" })
    await pause(300)
    expect(label()).toBeNull()
    land()
    await waitFor(() => expect(label()?.textContent).toContain("Tool 0 tip"), { timeout: 3000 })
    const at = (await shown) - came
    expect(at).toBeGreaterThanOrEqual(390)
    // When the code is in (about 300 ms here, later on a busy machine), only what's left of the 400 ms: +200 is slack.
    expect(at).toBeLessThan(Math.max(400, load.at - came) + 200)
  })
})

describe("the tooltip's code", () => {
  type Walk = { files: Map<string, string | null>; packages: Array<[string, string]> }
  it("keeps Radix's tooltip off every first load: components/ui/tooltip reaches none of it", () => {
    const { packages } = walk(["components/ui/tooltip.tsx"]) as Walk
    expect(packages.map(([spec]) => spec)).not.toContain("@radix-ui/react-tooltip")
  })

  it("reaches no shared core from its lazy part, which would re-cut every route's chunks", () => {
    const { files, packages } = walk(["components/ui/tooltipBridge.tsx"]) as Walk
    expect([...files.keys()].sort()).toEqual(["components/ui/tooltipBridge.tsx", "lib/utils/helpers/cn.ts"])
    expect(packages.map(([spec]) => spec).sort()).toEqual(["@radix-ui/react-tooltip", "clsx", "react", "tailwind-merge"])
  })
})
