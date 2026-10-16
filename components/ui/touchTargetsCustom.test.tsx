import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { AiComposer } from "@/components/ai/AiComposer"
import { HubSectionHeader } from "@/components/ui/hubRow"

// QA SH-04 (14 Oct 2026), the custom controls: the base touch rule
// (app/phone.css F3, data-touch-target) gives a control a 44px tap without
// drawing it bigger, and the base components carry it. These are drawn by
// hand, so they carry it themselves. Where two sit closer than 44 less their
// size, they move apart on a touch screen (pointer-coarse:), so neither takes
// the other's taps; nothing is drawn smaller.

afterEach(cleanup)

const src = (file: string) => readFileSync(join(process.cwd(), file), "utf8")

describe("custom controls take a finger's tap", () => {
  it("gives a hub section's action the rule: Calendar, See all, All projects, Search", () => {
    render(<HubSectionHeader title="Today" action={<a href="https://calendar.example">Calendar</a>} />)
    expect(screen.getByRole("link", { name: "Calendar" }).hasAttribute("data-touch-target")).toBe(true)
  })

  it("gives the AI composer's mic, Send and Stop the rule, 16px apart on a touch screen", () => {
    const mic = { available: true, recording: false, busy: false, label: "Dictate", toggle: () => {} }
    const { rerender } = render(<AiComposer value="hi" onChange={() => {}} onSend={() => {}} onStop={() => {}} streaming={false} mic={mic} />)
    for (const name of ["Dictate", "Send message"]) expect(screen.getByRole("button", { name }).hasAttribute("data-touch-target")).toBe(true)
    expect(screen.getByRole("button", { name: "Send message" }).parentElement?.className).toContain("pointer-coarse:gap-4")
    rerender(<AiComposer value="hi" onChange={() => {}} onSend={() => {}} onStop={() => {}} streaming mic={mic} />)
    expect(screen.getByRole("button", { name: "Stop generating" }).hasAttribute("data-touch-target")).toBe(true)
  })

  it("gives the AI page's tools the rule, 16px apart in the panel's header on a touch screen", () => {
    const panel = src("components/ai/AiChatPanel.tsx")
    for (const label of ["New conversation", "More AI tools", "Close panel"]) {
      expect(panel).toMatch(new RegExp(`data-touch-target=""[^>]*aria-label="${label}"`))
    }
    expect(panel).toMatch(/<div className="flex shrink-0 items-center gap-0\.5 pointer-coarse:gap-4">\s*\{tools\}/)
    expect(src("components/ai/ChatHistoryMenu.tsx")).toMatch(/aria-label="Past conversations"[^>]*data-touch-target=""/)
  })

  it("draws the phone bar's tools at 40px whatever their desktop classes, 4px apart", () => {
    const css = src("app/phone.css")
    const at = css.indexOf("/* C2. A page's own tools")
    const rule = css.slice(at, css.indexOf("@layer components", at))
    // Outside every layer: a utility (size-7) outranks anything in one.
    expect(rule).toMatch(/\[data-phone-bar-actions\] > button \{\s*width: 40px;\s*height: 40px;\s*border-radius: 12px;/)
    expect(rule).toMatch(/\[data-phone-bar-actions\] > button svg \{\s*width: 20px;\s*height: 20px;/)
    expect(src("components/navigationBar/mobile/phoneBarActions.tsx")).toMatch(/data-phone-bar-actions="" className="flex items-center gap-1"/)
  })

  it("gives needs-me's Open and Done the rule, 20px apart on a touch screen", () => {
    const needs = src("components/home/NeedsMeSection.tsx")
    expect(needs).toMatch(/<span className="flex items-center gap-px pointer-coarse:gap-5">/)
    expect(needs).toMatch(/aria-label="Open"\s*title="Open"\s*data-touch-target=""/)
    expect(needs).toMatch(/<Link href=\{item\.href\} data-touch-target="" className="text-meta text-ink-3/)
    // Done is a HubToolButton, which carries it (hubRow.test.tsx).
  })

  it("gives the profile's status chip the rule", () => {
    expect(src("components/profile/ProfileIdentityBand.tsx")).toMatch(/data-status-chip=""\s*data-touch-target=""/)
  })

  it("gives the memory page's tabs the rule, and its row actions 16px apart on a touch screen", () => {
    const memory = src("components/ai/WorkspaceMemoryPanel.tsx")
    expect(memory.match(/role="tab"\s*aria-selected=\{active\}\s*type="button"\s*data-touch-target=""/g)).toHaveLength(2)
    expect(memory).toMatch(/"flex items-center gap-0\.5 pointer-coarse:gap-4 flex-shrink-0 transition-opacity"/)
  })

  it("gives the templates' kind chips the rule, rows 14px apart on a touch screen", () => {
    const page = src("app/app/templates/page.tsx")
    expect(page).toMatch(/<div className="mb-5 flex flex-wrap gap-1\.5 pointer-coarse:gap-y-3\.5">/)
    expect(page).toMatch(/aria-pressed=\{kind === f\.value\}\s*data-touch-target=""/)
  })
})
