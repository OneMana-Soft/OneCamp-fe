import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { HubRow, HubRowSkeleton, HubToolButton } from "@/components/ui/hubRow"
import { KindBadge, KIND_BADGE_TONE } from "@/components/ui/kindBadge"

/** The HubRow (hub.md §1.2): one row anatomy for every hub list. */
const CSS = readFileSync(join(process.cwd(), "app/hub.css"), "utf8")

afterEach(cleanup)

describe("the HubRow", () => {
  it("draws its three densities at 36, 52 and 64px, 8px taller on touch", () => {
    expect(CSS).toMatch(/\.hub-row\[data-density="compact"\] \{\s*min-height: 36px;/)
    expect(CSS).toMatch(/\.hub-row\[data-density="two-line"\] \{\s*min-height: 52px;/)
    expect(CSS).toMatch(/\.hub-row\[data-density="feed"\] \{\s*--hub-lead: 32px;\s*min-height: 64px;/)
    const touch = CSS.slice(CSS.indexOf("@media (pointer: coarse)"))
    expect(touch).toMatch(/compact"\] \{ min-height: 44px; \}/)
    expect(touch).toMatch(/two-line"\] \{ min-height: 60px; \}/)
    expect(touch).toMatch(/feed"\] \{ min-height: 72px; \}/)
  })

  it("says unread with a dot in the gutter only: read and unread rows have the same weight", () => {
    const { container } = render(
      <>
        <HubRow density="feed" title={<b>Jonas</b>} unread />
        <HubRow density="feed" title={<b>Jonas</b>} unread={false} />
      </>,
    )
    const [a, b] = Array.from(container.querySelectorAll("[data-hub-row]"))
    expect(a.querySelector(".hub-unread-dot")?.hasAttribute("data-read")).toBe(false)
    expect(b.querySelector(".hub-unread-dot")?.hasAttribute("data-read")).toBe(true)
    const weight = (el: Element) => el.querySelector(".min-w-0 > span")?.className
    expect(weight(a)).toBe(weight(b))
  })

  // On one line at 390px, "Jonas Weber mentioned you in #acme" lost the place.
  it("lets a feed row's sentence take two lines on a phone, and keeps the others to one", () => {
    const { container } = render(
      <>
        <HubRow density="feed" title="Jonas Weber mentioned you in #acme" />
        <HubRow density="two-line" title="Write the launch announcement" />
      </>,
    )
    const [feed, two] = Array.from(container.querySelectorAll("[data-hub-row] .min-w-0 > span")).filter((s) => s.parentElement?.parentElement?.hasAttribute("data-hub-row"))
    expect(feed.className).toContain("max-sm:line-clamp-2")
    expect(feed.className).toContain("max-sm:whitespace-normal")
    expect(two.className).not.toContain("line-clamp")
  })

  it("has no dot at all in a list with no read state", () => {
    const { container } = render(<HubRow density="two-line" title="Write the launch announcement" />)
    expect(container.querySelector(".hub-unread-dot")).toBeNull()
  })

  it("floats its toolbar on e3 at r10, in place of the meta on hover", () => {
    const tools = CSS.slice(CSS.indexOf(".hub-row-tools {"), CSS.indexOf("}", CSS.indexOf(".hub-row-tools {")))
    expect(tools).toMatch(/border-radius: 10px/)
    expect(tools).toMatch(/box-shadow: var\(--e3\)/)
    // On focus everywhere; on hover only where a pointer can hover, so a tap never leaves it gone.
    expect(CSS).toMatch(/\.hub-row\[data-has-tools\]:focus-within \.hub-row-meta \{\s*opacity: 0;/)
    expect(CSS).toMatch(/@media \(hover: hover\) \{\s*\.hub-row\[data-has-tools\]:hover \.hub-row-meta \{\s*opacity: 0;/)
    const { container } = render(
      <HubRow density="two-line" title="t" meta="10:42" tools={<HubToolButton label="Done" shortcut="E">x</HubToolButton>} />,
    )
    expect(container.querySelector("[data-has-tools]")).toBeTruthy()
    expect(container.querySelector('button[aria-label="Done"]')?.getAttribute("title")).toBe("Done (E)")
  })

  it("draws separators inset to the content column, never in compact", () => {
    expect(CSS).toMatch(/\.hub-row:is\(\[data-density="two-line"\], \[data-density="feed"\]\) \+ \.hub-row::before/)
    expect(CSS).toMatch(/left: calc\(12px \+ var\(--hub-lead\) \+ 12px\)/)
  })

  it("leaves with the resolve recipe's slide, by transform", () => {
    const { container } = render(<HubRow density="two-line" title="t" resolve="leaving" />)
    expect(container.querySelector("[data-hub-row]")?.className).toContain("hub-resolve-out")
    const kf = CSS.slice(CSS.indexOf("@keyframes hub-resolve-out"), CSS.indexOf("}\n}", CSS.indexOf("@keyframes hub-resolve-out")))
    expect(kf).toMatch(/translateX\(12px\)/)
    expect(kf).not.toMatch(/height/)
  })

  it("has a skeleton in its own shape", () => {
    const { container } = render(<HubRowSkeleton density="feed" />)
    expect(container.querySelector("[data-hub-skeleton][data-density=feed]")).toBeTruthy()
  })
})

// Interaction audit SH-31, SH-32 (15 Oct 2026): app/hub.css hid the toolbar
// wherever nothing can hover, so on a phone the inbox, Later and search rows
// had no way to mark read, save, remind or remove.
describe("a row's tools where nothing can hover", () => {
  const touch = () => {
    const at = CSS.indexOf(".hub-row-more {")
    return CSS.slice(CSS.indexOf("@media (hover: none)", at), CSS.indexOf("@media (pointer: coarse)", at))
  }

  it("shows an Actions button there, and only there, which a finger can reach", () => {
    expect(CSS).toMatch(/\.hub-row-more \{\s*display: none;/)
    expect(touch()).toMatch(/\.hub-row-more \{[^}]*display: grid;/)
    expect(touch()).toMatch(/\.hub-row\[data-has-tools\] \{\s*grid-template-columns: 12px var\(--hub-lead\) minmax\(0, 1fr\) auto auto;/)
    render(<HubRow density="two-line" title="Launch notes" tools={<HubToolButton label="Done">x</HubToolButton>} />)
    const more = screen.getByRole("button", { name: "Actions" })
    expect(more.hasAttribute("data-touch-target")).toBe(true)
    expect(screen.getByRole("button", { name: "Done" }).hasAttribute("data-touch-target")).toBe(true)
  })

  it("shows the tools on a tapped Actions, or keyboard focus in the row, and never hides them from a finger again", () => {
    const shown = touch().slice(touch().indexOf(".hub-row:is("))
    expect(shown).toMatch(/^\.hub-row:is\(\[data-revealed\], :focus-visible, :has\(:focus-visible\)\) \.hub-row-tools \{\s*display: flex;\s*opacity: 1;\s*pointer-events: auto;/)
    // Under a finger each tool is 44px across.
    const coarse = CSS.slice(CSS.indexOf("@media (pointer: coarse)", CSS.indexOf(".hub-row-more {")))
    expect(coarse).toMatch(/\.hub-row-tools > :is\(a, button\) \{\s*min-width: var\(--m-hit\);\s*min-height: var\(--m-hit\);/)
  })

  it("reveals on Actions without opening the row, and puts them away on a tap elsewhere or Escape", () => {
    const opened = vi.fn()
    const tree = (menu: boolean) => (
      <>
        <HubRow density="two-line" title="Launch notes" onClick={opened} tools={<HubToolButton label="Done">x</HubToolButton>} />
        {menu && <div role="menu" data-testid="menu" />}
        <p data-testid="away">elsewhere</p>
      </>
    )
    const { container, rerender } = render(tree(true))
    const row = container.querySelector("[data-hub-row]")!
    const more = screen.getByRole("button", { name: "Actions" })
    expect(row.getAttribute("data-reveal")).toBe("tap")
    expect(more.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(more)
    expect(row.hasAttribute("data-revealed")).toBe(true)
    expect(more.getAttribute("aria-expanded")).toBe("true")
    expect(opened).not.toHaveBeenCalled()

    // A tap on a tool, or in a tool's own menu, keeps them out.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Done" }))
    fireEvent.pointerDown(screen.getByTestId("menu"))
    expect(row.hasAttribute("data-revealed")).toBe(true)

    fireEvent.pointerDown(screen.getByTestId("away"))
    expect(row.hasAttribute("data-revealed")).toBe(false)

    fireEvent.click(more)
    // A tool's menu open takes Escape first (one press, one thing, the
    // innermost first: lib/keys/escape), and the tools stay out;
    fireEvent.keyDown(document, { key: "Escape" })
    expect(row.hasAttribute("data-revealed")).toBe(true)
    // with the menu gone, the next Escape puts them away.
    rerender(tree(false))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(row.hasAttribute("data-revealed")).toBe(false)
  })

  it("shows the tools for keyboard focus in the row, keeps them while Tab walks through, and not for a tap's focus", () => {
    const { container } = render(
      <>
        <HubRow density="two-line" title="Launch notes" tools={<HubToolButton label="Done">x</HubToolButton>} />
        <div role="menu"><button>Tomorrow</button></div>
        <button>Next</button>
      </>,
    )
    const row = container.querySelector("[data-hub-row]")!
    const done = screen.getByRole("button", { name: "Done" })
    const real = Element.prototype.matches
    let keyboard = false
    const spy = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, sel: string) {
      return sel === ":focus-visible" ? keyboard && this === document.activeElement : real.call(this, sel)
    })
    try {
      // A tap's focus (Android focuses what it taps) shows nothing.
      act(() => done.focus())
      expect(row.hasAttribute("data-revealed")).toBe(false)
      act(() => done.blur())

      keyboard = true
      act(() => done.focus())
      expect(row.hasAttribute("data-revealed")).toBe(true)
      // Into a tool's own menu: the tools stay.
      act(() => screen.getByRole("button", { name: "Tomorrow" }).focus())
      expect(row.hasAttribute("data-revealed")).toBe(true)
      act(() => done.focus())
      // Out of the row: they go.
      act(() => screen.getByRole("button", { name: "Next" }).focus())
      expect(row.hasAttribute("data-revealed")).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  // SH-29, SH-30: a row that opens through its stretched title is a row of
  // the interaction layer (it tints and presses), and a list's keyboard place
  // is an inset ring of its own, never the selected look.
  it("is a row of the layer when it opens through its title, and a quiet item when it doesn't", () => {
    const { container, rerender } = render(<HubRow density="two-line" opens title={<button type="button">Q4 launch plan</button>} />)
    expect(container.querySelector("[data-hub-row]")!.getAttribute("data-interactive")).toBe("row")
    rerender(<HubRow density="two-line" title="Q4 launch plan" />)
    expect(container.querySelector("[data-hub-row]")!.hasAttribute("data-interactive")).toBe(false)
  })

  it("draws the keyboard's place as a ring, apart from selected", () => {
    const { container, rerender } = render(<HubRow density="feed" opens cursor title="Maya Chen" />)
    const row = container.querySelector("[data-hub-row]")!
    expect(row.querySelector("[data-kbd-cursor]")!.className).toContain("ring-cursor")
    expect(row.hasAttribute("data-selected")).toBe(false)
    rerender(<HubRow density="feed" opens selected title="Maya Chen" />)
    expect(row.querySelector("[data-kbd-cursor]")).toBeNull()
    expect(row.getAttribute("data-selected")).toBe("true")
  })

  it("has no Actions on a row with no tools", () => {
    const { container } = render(<HubRow density="two-line" title="Launch notes" meta="10:42" />)
    expect(screen.queryByRole("button", { name: "Actions" })).toBeNull()
    expect(container.querySelector("[data-hub-row]")?.hasAttribute("data-reveal")).toBe(false)
  })
})

describe("the section header's action", () => {
  it("takes a finger's tap (QA SH-04), and leaves a fragment as it is", async () => {
    const { HubSectionHeader } = await import("@/components/ui/hubRow")
    render(<HubSectionHeader title="What needs me now" action={<button type="button">See all</button>} />)
    expect(screen.getByRole("button", { name: "See all" }).hasAttribute("data-touch-target")).toBe(true)
    cleanup()
    render(<HubSectionHeader title="Today" action={<><button type="button">One</button></>} />)
    expect(screen.getByRole("button", { name: "One" }).hasAttribute("data-touch-target")).toBe(false)
  })
})

describe("the kind badge", () => {
  it("draws a refusal in the agent's tint, never danger or brand", () => {
    expect(KIND_BADGE_TONE.refused).toBe("bg-agent-muted text-agent-ink")
    for (const tone of Object.values(KIND_BADGE_TONE)) expect(tone).not.toMatch(/danger|destructive/)
    const { container } = render(<KindBadge kind="reaction" emoji="🎉" />)
    expect(container.textContent).toBe("🎉")
  })
})
