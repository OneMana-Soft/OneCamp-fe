import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { HubRow, HubRowSkeleton, HubToolButton } from "@/components/ui/hubRow"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

  // V-939: an agent's Dismiss and Approve beside its words left them ~170px
  // on a phone. A caller whose meta holds actions opts in (data-meta-below);
  // no other row moves. With no meta, row 2 is empty and 0px (no row gap).
  it("puts a meta that holds actions on a line of its own under the content on a phone, and only when asked", () => {
    const phone = CSS.slice(CSS.indexOf("@media (max-width: 639.98px) {\n    .hub-row[data-meta-below]"))
    expect(phone).toMatch(/^@media \(max-width: 639\.98px\) \{\s*\.hub-row\[data-meta-below\] \{\s*grid-template-columns: 12px var\(--hub-lead\) minmax\(0, 1fr\);/)
    expect(phone).toMatch(/\.hub-row\[data-meta-below\] > \.hub-row-meta \{\s*grid-area: 2 \/ 3;\s*justify-self: end;\s*margin-top: 8px;/)
    // Actions, where a row has tools, stays on the first line.
    expect(phone).toMatch(/\.hub-row\[data-meta-below\] > \.hub-row-more \{\s*grid-row: 1;/)
    const { container } = render(<HubRow density="two-line" title="Ledger wants to file 2 expenses" meta={<button type="button">Approve</button>} data-meta-below="" />)
    expect(container.querySelector("[data-hub-row][data-meta-below] > .hub-row-meta")).not.toBeNull()
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

  it("keeps the toolbar out of sight there, where Actions is, and never hides the meta for it", () => {
    // No tray floats over the row (V-704): the tools stay laid out at the
    // row's end, unseen and untouched, and the drawer presses them.
    expect(touch()).toMatch(/\.hub-row-tools \{\s*visibility: hidden;/)
    expect(CSS).not.toMatch(/data-revealed/)
    expect(touch()).toMatch(/\.hub-row\[data-has-tools\]:focus-within \.hub-row-meta \{\s*opacity: 1;/)
    // A finger that can hover (a touch laptop) still gets 44px tools.
    const coarse = CSS.slice(CSS.indexOf("@media (pointer: coarse)", CSS.indexOf(".hub-row-more {")))
    expect(coarse).toMatch(/\.hub-row-tools > :is\(a, button\) \{\s*min-width: var\(--m-hit\);\s*min-height: var\(--m-hit\);/)
  })

  // V-704, D6: on a phone, Actions was a tray of two unworded icons. It is now
  // the one drawer (the DropdownMenu, a sheet on a phone) for every HubRow,
  // listing the row's own tools in their own words: no tool says anything new.
  it("opens one drawer from Actions, each row worded from its tool's own label, and never opens the row", async () => {
    const opened = vi.fn()
    const done = vi.fn()
    render(
      <HubRow
        density="two-line"
        title="Launch notes"
        onClick={opened}
        tools={
          <>
            <HubToolButton label="Mark done" shortcut="E" onClick={done}>
              <svg data-glyph="check" />
            </HubToolButton>
            <a href="/app/later/1" aria-label="Open">
              <svg />
            </a>
            <button type="button">Move back</button>
            <HubToolButton label="Delete" disabled>
              <svg />
            </HubToolButton>
          </>
        }
      />,
    )
    const more = screen.getByRole("button", { name: "Actions" })
    expect(more.getAttribute("aria-haspopup")).toBe("menu")
    fireEvent.click(more)
    expect(opened).not.toHaveBeenCalled()

    fireEvent.keyDown(more, { key: "Enter" })
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Mark done", "Open", "Move back", "Delete"])
    expect(within(menu).getByRole("menuitem", { name: "Delete" }).getAttribute("aria-disabled")).toBe("true")
    // Each row carries its tool's glyph.
    expect(within(menu).getByRole("menuitem", { name: "Mark done" }).querySelector('[data-glyph="check"]')).not.toBeNull()

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Mark done" }))
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("menu")).toBeNull()
    expect(opened).not.toHaveBeenCalled()
  })

  it("presses a tool that opens its own menu, so its menu opens from the drawer", async () => {
    render(
      <HubRow
        density="two-line"
        title="Launch notes"
        tools={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Save for later">
                <svg />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Tomorrow</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />,
    )
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Save for later" }))
    expect(await screen.findByRole("menuitem", { name: "Tomorrow" })).toBeInTheDocument()
  })

  it("presses the tool once the drawer has given the focus back, so a panel the tool opens keeps it", async () => {
    render(
      <>
        <HubRow
          density="two-line"
          title="Launch notes"
          tools={
            <HubToolButton label="Why am I seeing this?" onClick={() => screen.getByTestId("panel").focus()}>
              <svg />
            </HubToolButton>
          }
        />
        <div tabIndex={-1} data-testid="panel" />
      </>,
    )
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Why am I seeing this?" }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("panel")))
  })

  // CR-333 N2 (main, 14 Nov): a popover a tool opens from the drawer gives the focus back to the tool on close, as a
  // trigger does; the tool is hidden there (visibility, app/hub.css) and can't hold it, so it fell to <body>.
  it("gives the focus to Actions when a popover the drawer's tool opened closes, never to the hidden tool", async () => {
    render(
      <HubRow
        density="two-line"
        title="Launch notes"
        tools={
          <Popover>
            <PopoverTrigger asChild>
              <HubToolButton label="Why am I seeing this?" style={{ visibility: "hidden" }}>
                <svg />
              </HubToolButton>
            </PopoverTrigger>
            <PopoverContent>Because you were mentioned</PopoverContent>
          </Popover>
        }
      />,
    )
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Why am I seeing this?" }))
    const words = await screen.findByText("Because you were mentioned")
    fireEvent.keyDown(words, { key: "Escape" })
    await waitFor(() => expect(screen.queryByText("Because you were mentioned")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions" })))
  })

  it("lists what the row's tools are now: a tool that changed its words says its new ones", async () => {
    const Row = ({ unread }: { unread: boolean }) => (
      <HubRow density="two-line" title="Launch notes" tools={<HubToolButton label={unread ? "Mark read" : "Mark unread"}>x</HubToolButton>} />
    )
    const { rerender } = render(<Row unread />)
    // Actions is a button until the drawer's code is in, then the drawer's own trigger: found anew each time.
    const more = () => screen.getByRole("button", { name: "Actions" })
    fireEvent.keyDown(more(), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mark read" }))
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    rerender(<Row unread={false} />)
    fireEvent.keyDown(more(), { key: "Enter" })
    expect(await screen.findByRole("menuitem", { name: "Mark unread" })).toBeInTheDocument()
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

  it("marks a rule with the Rules tool's glyph, in the dusk tone", () => {
    expect(KIND_BADGE_TONE.rule).toBe("bg-camp-dusk-tint text-camp-dusk-ink")
    const { container } = render(<KindBadge kind="rule" />)
    const badge = container.querySelector("[data-kind-badge=rule]")
    expect(badge?.querySelector("svg.lucide-workflow")).toBeTruthy()
    expect(badge?.className).toContain("bg-camp-dusk-tint text-camp-dusk-ink")
  })

  // A row with no one behind its sentence (a rule's notice) leads with its
  // kind: the badge at the face's size, in the face's place, with no ring.
  it("leads a row at the face's size, and otherwise sits at the face's corner", () => {
    const { container } = render(
      <>
        <KindBadge kind="rule" lead={32} />
        <KindBadge kind="rule" lead={24} />
        <KindBadge kind="mention" />
      </>,
    )
    const [feed, compact, corner] = Array.from(container.querySelectorAll<HTMLElement>("[data-kind-badge]"))
    expect(feed.dataset.lead).toBe("32")
    expect(feed.className.split(" ")).toEqual(expect.arrayContaining(["hub-kind-badge", "static", "size-8", "shadow-none", "[&_svg]:size-4"]))
    expect(compact.dataset.lead).toBe("24")
    expect(compact.className.split(" ")).toEqual(expect.arrayContaining(["static", "size-6", "shadow-none", "[&_svg]:size-3"]))
    expect(corner.dataset.lead).toBeUndefined()
    expect(corner.className).toBe("hub-kind-badge bg-brand-muted text-brand-text")
  })
})
