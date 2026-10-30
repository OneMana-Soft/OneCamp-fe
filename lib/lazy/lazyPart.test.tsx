import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"

import { lazyPart } from "@/lib/lazy/lazyPart"

// A part of a screen whose code is a chunk of its own (lib/lazy/lazyPart):
// drawn at once once its code is in, its room kept while the code comes, and
// a failure said in its own place, never thrown to the page.

type Props = { label: string }

const Real = ({ label }: Props) => <p data-real="">{label}</p>
const Room = () => <div data-room="" />
const Failed = ({ retry }: Props & { retry: () => void }) => (
  <button type="button" onClick={retry}>
    Try again
  </button>
)

/** A loader the test settles by hand. */
function deferredLoads() {
  const calls: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []
  const load = vi.fn(
    () =>
      new Promise<React.ComponentType<Props>>((resolve, reject) => {
        calls.push({ resolve: () => resolve(Real), reject })
      }),
  )
  return { load, calls }
}

const settle = () => act(async () => {})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("a lazy part of a screen", () => {
  it("keeps its room while its code comes, then draws the part", async () => {
    const { load, calls } = deferredLoads()
    const { Part } = lazyPart(load, { placeholder: Room, failed: Failed })
    const { container } = render(<Part label="Open tickets" />)
    expect(container.querySelector("[data-room]")).not.toBeNull()
    expect(container.querySelector("[data-real]")).toBeNull()
    calls[0].resolve()
    await settle()
    expect(container.querySelector("[data-real]")?.textContent).toBe("Open tickets")
    expect(container.querySelector("[data-room]")).toBeNull()
  })

  it("draws at once once its code is in: no placeholder frame", async () => {
    const { load, calls } = deferredLoads()
    const { Part, warm, isIn } = lazyPart(load, { placeholder: Room, failed: Failed })
    const warmed = warm()
    // Says whether its code is in, for a part that waited to show it landed.
    expect(isIn()).toBe(false)
    calls[0].resolve()
    expect(await warmed).toBe(true)
    expect(isIn()).toBe(true)
    const { container } = render(<Part label="At once" />)
    expect(container.querySelector("[data-real]")?.textContent).toBe("At once")
  })

  it("fetches its code once, however many copies are drawn or warmed", async () => {
    const { load, calls } = deferredLoads()
    const { Part, warm } = lazyPart(load, { placeholder: Room, failed: Failed })
    void warm()
    render(
      <>
        <Part label="one" />
        <Part label="two" />
        <Part label="three" />
      </>,
    )
    void warm()
    expect(load).toHaveBeenCalledTimes(1)
    calls[0].resolve()
    await settle()
    expect([...document.querySelectorAll("[data-real]")].map((e) => e.textContent)).toEqual(["one", "two", "three"])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("says its code couldn't come in its own place, and Try again fetches it again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    const { Part } = lazyPart(load, { placeholder: Room, failed: Failed })
    const { container } = render(
      <main>
        <h1>The rest of the page</h1>
        <Part label="A chart" />
      </main>,
    )
    calls[0].reject(new Error("Loading chunk 123 failed"))
    await settle()
    // The page carries on; only the part says it failed.
    expect(screen.getByRole("heading", { name: "The rest of the page" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await settle()
    // While it tries again, the part's room is kept.
    expect(container.querySelector("[data-room]")).not.toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
    calls[1].resolve()
    await settle()
    expect(container.querySelector("[data-real]")?.textContent).toBe("A chart")
  })

  it("tries again by itself when the browser is back online", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    const { Part } = lazyPart(load, { placeholder: Room, failed: Failed })
    const { container } = render(<Part label="Back" />)
    calls[0].reject(new TypeError("Failed to fetch dynamically imported module"))
    await settle()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    act(() => void window.dispatchEvent(new Event("online")))
    expect(load).toHaveBeenCalledTimes(2)
    calls[1].resolve()
    await settle()
    expect(container.querySelector("[data-real]")?.textContent).toBe("Back")
  })

  it("tries again when another copy is drawn after a failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    const { Part } = lazyPart(load, { placeholder: Room, failed: Failed })
    render(<Part label="first" />)
    calls[0].reject(new Error("offline"))
    await settle()
    render(<Part label="second" />)
    await settle()
    expect(load).toHaveBeenCalledTimes(2)
    calls[1].resolve()
    await settle()
    expect([...document.querySelectorAll("[data-real]")].map((e) => e.textContent)).toEqual(["first", "second"])
  })

  // An overlay whose failure closes it (Docs & Files' dialogs, the Pages
  // sheet) would otherwise close again at once, before the try.
  it("keeps a copy drawn after a failure in its room while it tries again, and says it failed only if that fails too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    const { Part } = lazyPart(load, { placeholder: Room, failed: Failed })
    const first = render(<Part label="first" />)
    calls[0].reject(new Error("offline"))
    await settle()
    first.unmount()
    const { container } = render(<Part label="second" />)
    expect(container.querySelector("[data-room]")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
    calls[1].reject(new Error("still offline"))
    await settle()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })

  it("draws its placeholder on the server, as the browser's first render does", async () => {
    const { load, calls } = deferredLoads()
    const { Part, warm } = lazyPart(load, { placeholder: Room, failed: Failed })
    const warmed = warm()
    calls[0].resolve()
    await warmed
    expect(renderToString(<Part label="hydrates" />)).toContain("data-room")
  })
})

// A part that keeps no room (the realtime engine, the theme's sync, the
// palette, the keys tip) passed a Nothing of its own, written four times
// (CODE-REVIEW, 22 Oct 2026): with neither given, it draws nothing.
describe("a lazy part with no room to keep", () => {
  it("draws nothing while its code comes, nothing when it fails, then the part", async () => {
    const { load, calls } = deferredLoads()
    const part = lazyPart(load)
    const { container } = render(<part.Part label="Hi" />)
    expect(container.innerHTML).toBe("")
    const first = part.warm()
    calls[0].reject(new Error("offline"))
    await settle()
    expect(await first).toBe(false)
    expect(container.innerHTML).toBe("")
    const second = part.warm()
    calls[1].resolve()
    await settle()
    expect(await second).toBe(true)
    expect(screen.getByText("Hi").hasAttribute("data-real")).toBe(true)
  })
})
