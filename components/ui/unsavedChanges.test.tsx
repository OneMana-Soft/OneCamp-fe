import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Unsaved changes were guarded only against closing the tab. A click on any
// link in the sidebar, or a switch of admin section (which unmounts the card),
// dropped them without a word.

const state = vi.hoisted(() => ({ confirms: [] as { title: string; description: string; onConfirm: () => void }[], pushed: [] as string[] }))
vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => (opts: { title: string; description: string; onConfirm: () => void }) => state.confirms.push(opts),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (href: string) => state.pushed.push(href) }) }))

const { SaveBar } = await import("@/components/ui/settingsSection")
const { UnsavedChangesGuard } = await import("@/components/ui/UnsavedChangesGuard")
const { unsavedWhat } = await import("@/lib/unsavedChanges")

beforeEach(() => {
  state.confirms.length = 0
  state.pushed.length = 0
})
afterEach(cleanup)

function Page({ dirty }: { dirty: boolean }) {
  return (
    <>
      <UnsavedChangesGuard />
      <a href="/app/home">Home</a>
      <a href="https://example.com/docs">Elsewhere</a>
      <a href="#section">Section</a>
      <SaveBar dirty={dirty} saving={false} onSave={() => {}} onDiscard={() => {}} what="email changes" />
    </>
  )
}

const click = (el: Element) => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
  el.dispatchEvent(event)
  return event
}

describe("unsaved changes", () => {
  it("are known while the bar shows, and forgotten when it goes", () => {
    const { rerender, unmount } = render(<Page dirty />)
    expect(unsavedWhat()).toBe("email changes")
    rerender(<Page dirty={false} />)
    expect(unsavedWhat()).toBeNull()
    rerender(<Page dirty />)
    unmount()
    expect(unsavedWhat()).toBeNull()
  })

  it("stop a link to another page, nudge the dock once, then ask, naming what would be lost", () => {
    const { getByText } = render(<Page dirty />)
    const nudged = vi.fn()
    window.addEventListener("onecamp:save-nudge", nudged)
    // Design v3 (admin §1.3): the dock holding the changes nudges first.
    const first = click(getByText("Home"))
    expect(first.defaultPrevented).toBe(true)
    expect(nudged).toHaveBeenCalledTimes(1)
    expect(state.confirms).toHaveLength(0)
    window.removeEventListener("onecamp:save-nudge", nudged)
    // A second try asks.
    const event = click(getByText("Home"))
    expect(event.defaultPrevented).toBe(true)
    expect(state.confirms).toHaveLength(1)
    expect(state.confirms[0].description).toMatch(/email changes/)
    state.confirms[0].onConfirm()
    expect(state.pushed).toEqual(["/app/home"])
  })

  it("leave links alone when nothing is unsaved, and never stop a link out of the app or within the page", () => {
    const { getByText, rerender } = render(<Page dirty={false} />)
    expect(click(getByText("Home")).defaultPrevented).toBe(false)
    rerender(<Page dirty />)
    expect(click(getByText("Elsewhere")).defaultPrevented).toBe(false)
    expect(click(getByText("Section")).defaultPrevented).toBe(false)
    expect(state.confirms).toHaveLength(0)
  })

  it("are guarded on every page, from the root", () => {
    const root = readFileSync(join(__dirname, "..", "providers", "ClientProviders.tsx"), "utf8")
    expect(root).toMatch(/<UnsavedChangesGuard\s*\/>/)
  })

  it("are asked about before the settings nav moves to another admin section", () => {
    // The sections are links in the settings nav now (design v3, admin §1.1):
    // the same page with another ?tab=, which the guard treats as leaving.
    const guard = readFileSync(join(__dirname, "UnsavedChangesGuard.tsx"), "utf8")
    expect(guard).toMatch(/url\.pathname === window\.location\.pathname && url\.search === window\.location\.search/)
    const nav = readFileSync(join(__dirname, "..", "navigationBar", "desktop", "SettingsNav.tsx"), "utf8")
    expect(nav).toMatch(/<IntentLink[\s\S]{0,80}href=\{place\.href\}/)
  })
})
