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

  it("stop a link to another page and ask first, naming what would be lost", () => {
    const { getByText } = render(<Page dirty />)
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

  it("are asked about before the admin page switches section", () => {
    const page = readFileSync(join(__dirname, "..", "..", "app", "app", "admin", "page.tsx"), "utf8")
    const choose = page.slice(page.indexOf("const chooseTab"), page.indexOf("useEffect", page.indexOf("const chooseTab")))
    expect(choose).toMatch(/unsavedWhat\(\)/)
    expect(choose).toMatch(/confirm\(/)
  })
})
