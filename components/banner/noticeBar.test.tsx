import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { NoticeBar, NoticeStack } from "./NoticeBar"

// Every app-wide notice is one row (design v3, shell T2): the email and disk
// banners each drew their own, with a dismiss of about 18px and no focus ring.
afterEach(cleanup)

describe("a notice", () => {
  it("dismisses from a 26px button, 44px under a finger, with a focus ring", () => {
    const onDismiss = vi.fn()
    render(<NoticeBar tone="warning" onDismiss={onDismiss}>Disk filling</NoticeBar>)
    const x = screen.getByRole("button", { name: "Dismiss" })
    const cls = x.className.split(/\s+/)
    expect(cls).toEqual(expect.arrayContaining(["size-[26px]", "[@media(pointer:coarse)]:size-11", "focus-visible:ring-2"]))
    fireEvent.click(x)
    expect(onDismiss).toHaveBeenCalled()
  })

  // At 390 the words sat beside a 44px button with a third of the width and
  // ran to four lines (the email notice; the demo's note, three).
  it("on a phone, gives its words the row and puts its action on a row under them", () => {
    render(<NoticeBar tone="info" lead="This demo is shared." action={<button className="notice-action">Got it</button>}>Everyone who opens it uses this account.</NoticeBar>)
    const row = screen.getByRole("status")
    expect(row.hasAttribute("data-has-action")).toBe(true)
    expect(row.querySelector(".notice-act")?.textContent).toBe("Got it")
    expect(row.querySelector(".notice-text")?.textContent).toMatch(/^This demo is shared\./)
    const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8")
    const phone = css.slice(css.indexOf("@media (max-width: 639.98px) {\n  .notice[data-has-action]"))
    expect(phone).toMatch(/grid-template-areas: "lead text close" ". act close";/)
    expect(phone).toMatch(/\.notice-act \.notice-action::after \{\s*content: "";\s*position: absolute;\s*inset: -4px 0;/)
  })

  it("is 40px at least, 13px words, with the fact in bold ink first", () => {
    render(<NoticeBar tone="info" lead="Email is off.">Invitations won&apos;t arrive.</NoticeBar>)
    const row = screen.getByRole("status")
    expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-10", "text-xs", "text-ink-2", "border-line"]))
    const lead = screen.getByText("Email is off.")
    expect(lead.tagName).toBe("B")
    expect(lead.className).toContain("text-ink")
  })

  it("takes its tone's ground, and a brand notice leads with the mark", () => {
    const { container } = render(
      <>
        <NoticeBar tone="info">a</NoticeBar>
        <NoticeBar tone="warning">b</NoticeBar>
        <NoticeBar tone="danger">c</NoticeBar>
        <NoticeBar tone="brand">d</NoticeBar>
      </>,
    )
    const rows = [...container.querySelectorAll("[data-notice]")]
    expect(rows.map((r) => r.className.match(/notice-(info|warning|danger|brand)/)?.[1])).toEqual(["info", "warning", "danger", "brand"])
    expect(rows[3].querySelector(".notice-mark")).not.toBeNull()
  })

  it("is the row the email, disk and import notices draw", () => {
    const root = join(__dirname, "..", "..")
    for (const f of ["components/banner/EmailOffBanner.tsx", "components/banner/DiskBanner.tsx", "components/banner/ImportOutcomeBanner.tsx"]) {
      expect(readFileSync(join(root, f), "utf8"), f).toMatch(/<NoticeBar\b/)
    }
  })
})

describe("the notices together", () => {
  it("shows two, the most urgent first, and folds the rest into one row", () => {
    render(
      <NoticeStack>
        <NoticeBar tone="info">Info</NoticeBar>
        <NoticeBar tone="warning">Warning</NoticeBar>
        <NoticeBar tone="brand">Brand</NoticeBar>
        <NoticeBar tone="danger">Danger</NoticeBar>
      </NoticeStack>,
    )
    expect(screen.getByText("Danger")).toBeTruthy()
    expect(screen.getByText("Warning")).toBeTruthy()
    expect(screen.queryByText("Info")).toBeNull()
    expect(screen.queryByText("Brand")).toBeNull()
    // Drawn in urgency order, whatever order they mounted in.
    expect((screen.getByText("Danger").closest("[data-notice]") as HTMLElement).style.order).toBe("0")
    expect((screen.getByText("Warning").closest("[data-notice]") as HTMLElement).style.order).toBe("1")

    const more = screen.getByRole("button", { name: /\+2 more notices/ })
    fireEvent.click(more)
    expect(screen.getByText("Info")).toBeTruthy()
    expect(screen.getByText("Brand")).toBeTruthy()
    expect(more.getAttribute("aria-expanded")).toBe("true")
  })

  it("has no overflow row while two or fewer want a place", () => {
    render(
      <NoticeStack>
        <NoticeBar tone="info">Info</NoticeBar>
        <NoticeBar tone="warning">Warning</NoticeBar>
      </NoticeStack>,
    )
    expect(screen.queryByRole("button", { name: /more notice/ })).toBeNull()
  })

  it("is mounted round the banners in both layouts, one strip at a time on a phone", () => {
    const layout = readFileSync(join(__dirname, "..", "..", "app/app/LayoutContent.tsx"), "utf8")
    expect(layout.match(/<NoticeStack( shown=\{1\})?>/g)).toHaveLength(2)
    // Design v3, mobile C10: 390px spares one strip.
    expect(layout).toMatch(/banners=\{\s*<NoticeStack shown=\{1\}>/)
  })

  it("shows only the most urgent on a phone, and folds the rest", () => {
    render(
      <NoticeStack shown={1}>
        <NoticeBar tone="brand">Demo</NoticeBar>
        <NoticeBar tone="warning">Disk</NoticeBar>
      </NoticeStack>,
    )
    expect(screen.getByText("Disk")).toBeTruthy()
    expect(screen.queryByText("Demo")).toBeNull()
    expect(screen.getByRole("button", { name: /\+1 more notice/ })).toBeTruthy()
  })
})
