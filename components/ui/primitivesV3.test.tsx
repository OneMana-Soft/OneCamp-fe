import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { buttonVariants } from "@/components/ui/button"
import { Chip, LabelChip } from "@/components/ui/chip"
import { PriorityGlyph, StatusGlyph } from "@/components/ui/graphics/glyphs"
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { SPARK_PATH } from "@/components/ui/graphics/motifs"
import { underlineTab, underlineTabsList } from "@/components/ui/tabs"
import { PrincipalTag } from "@/components/ui/principalTag"
import { TagPills } from "@/components/tags/TagPills"
import { hueFor } from "@/lib/campHue"

/**
 * The primitives of design v3 (DESIGN_V3.md §3.8 to §3.12), as their classes
 * say they are. jsdom has no stylesheet, so this pins the classes and the
 * utilities in globals.css they name; e2e/designSystem.spec.ts measures the
 * same primitives in Chromium.
 */
const CSS = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
const utility = (name: string) => {
  const at = CSS.indexOf(`@utility ${name} {`)
  expect(at, `@utility ${name}`).toBeGreaterThan(-1)
  return CSS.slice(at, CSS.indexOf("\n}", at))
}
afterEach(cleanup)

describe("Button", () => {
  it("is primary with the inner highlight and tinted drop, not a gradient", () => {
    const cls = buttonVariants({ variant: "default" })
    expect(cls).toContain("bg-brand")
    expect(cls).toContain("text-brand-foreground")
    expect(cls).toContain("shadow-primary")
    expect(cls).not.toMatch(/gradient/)
  })

  it("raises secondary (and outline) to e1, and to e2 under the cursor", () => {
    for (const variant of ["secondary", "outline"] as const) {
      const cls = buttonVariants({ variant })
      expect(cls).toContain("bg-raised")
      expect(cls).toContain("shadow-e1")
      expect(cls).toContain("hover:shadow-e2")
      expect(cls).not.toMatch(/\bborder\b/)
    }
  })

  it("draws ghost in ink-2 and subtle on the hover overlay, danger on the raised surface in danger ink", () => {
    expect(buttonVariants({ variant: "ghost" })).toMatch(/text-muted-foreground.*hover:bg-hover.*hover:text-foreground/)
    expect(buttonVariants({ variant: "subtle" })).toMatch(/bg-hover.*hover:bg-press/)
    const danger = buttonVariants({ variant: "destructive" })
    expect(danger).toContain("bg-raised")
    expect(danger).toContain("text-danger-ink")
    expect(danger).toContain("shadow-e1")
  })

  it("has the spec's sizes: xs 24, sm 28, md 32, lg 40, xl 46, and square icon buttons", () => {
    expect(buttonVariants({ size: "xs" })).toMatch(/\bh-6\b.*\brounded-sm\b/)
    expect(buttonVariants({ size: "sm" })).toMatch(/\bh-7\b/)
    expect(buttonVariants({ size: "default" })).toMatch(/\bh-8\b/)
    expect(buttonVariants({ size: "lg" })).toMatch(/\bh-10\b/)
    expect(buttonVariants({ size: "xl" })).toMatch(/h-\[46px\].*rounded-\[10px\]/)
    expect(buttonVariants({ size: "icon" })).toMatch(/\bh-8 w-8\b/)
    expect(buttonVariants({ size: "icon-sm" })).toMatch(/\bh-7 w-7\b/)
    expect(buttonVariants({ size: "icon-xs" })).toMatch(/\bh-6 w-6\b/)
    // 13/510 at every size but lg (14) and xl (15).
    expect(buttonVariants()).toMatch(/\btext-xs\b.*\bfont-medium\b/)
  })

  it("settles half a pixel when pressed, in 90ms", () => {
    expect(buttonVariants()).toContain("active:translate-y-[0.5px]")
    expect(buttonVariants()).toContain("active:duration-[90ms]")
  })

  it("puts a kbd hint inside a primary on an 18% white fill", () => {
    expect(buttonVariants()).toContain("[&_.kbd]:bg-white/[0.18]")
  })
})

describe("fields", () => {
  it("are the raised surface at e1 with a 1px accent ring and a 3px halo on focus, in danger when invalid", () => {
    // A components-layer class, so a caller's utilities (bg-transparent,
    // shadow-none on an inline-edited title) win over it.
    const at = CSS.indexOf("  .field-surface {")
    expect(at).toBeGreaterThan(CSS.lastIndexOf("@layer components {", at))
    const f = CSS.slice(at, CSS.indexOf("\n  }\n", at))
    expect(f).toMatch(/background-color: var\(--raised\);/)
    expect(f).toMatch(/box-shadow: var\(--e1\);/)
    expect(f).toMatch(/color: var\(--ink-3\);/)
    expect(f).toMatch(/0 0 0 1px color-mix\(in oklab, var\(--brand\) 50%, transparent\), 0 0 0 3px color-mix\(in oklab, var\(--brand\) 12%, transparent\)/)
    expect(f).toMatch(/\[aria-invalid="true"\][\s\S]*var\(--destructive\) 50%/)
  })
})

describe("chips and tags", () => {
  it("draws a chip 22px, r6, 12/510, neutral on the hover overlay in a hairline", () => {
    const c = utility("chip")
    expect(c).toMatch(/height: 22px;/)
    expect(c).toMatch(/border-radius: var\(--radius-sm\);/)
    expect(c).toMatch(/font-size: 12px;/)
    expect(c).toMatch(/font-weight: 510;/)
    expect(c).toMatch(/background-color: var\(--hover\);/)
    expect(c).toMatch(/box-shadow: inset 0 0 0 1px var\(--line\);/)
  })

  it("carries identity as a 6px dot, meaning as a tint, and a remove button when asked", () => {
    const onRemove = vi.fn()
    render(<Chip dot="sky" onRemove={onRemove} removeLabel="Remove cycle filter">Cycle: Launch week</Chip>)
    const dot = document.querySelector("[data-chip-dot]")!
    expect(dot.className).toMatch(/hue-sky.*size-1\.5.*bg-hue/)
    fireEvent.click(screen.getByRole("button", { name: "Remove cycle filter" }))
    expect(onRemove).toHaveBeenCalled()
    cleanup()
    render(<Chip tone="sun">Due today</Chip>)
    expect(document.querySelector("[data-chip]")!.className).toContain("bg-camp-sun-tint")
  })

  it("draws a label as a neutral chip with a dot in its own hue, never a tinted pill", () => {
    render(<LabelChip label="Launch" />)
    const chip = document.querySelector("[data-chip]")!
    expect(chip.className).toContain("chip")
    expect(chip.className).not.toMatch(/bg-hue-tint/)
    expect(chip.querySelector("[data-chip-dot]")!.className).toContain(`hue-${hueFor("Launch")}`)
    cleanup()
    render(<TagPills label="Launch, Copy" />)
    expect(document.querySelectorAll("[data-chip]")).toHaveLength(2)
  })

  it("draws a tag 18px, r5, 11/510: Agent in the agent tint, Bot neutral, Guest in sun", () => {
    const t = utility("tag")
    expect(t).toMatch(/height: 18px;/)
    expect(t).toMatch(/border-radius: 5px;/)
    expect(t).toMatch(/font-size: 11px;/)
    const tag = (kind: "ai" | "bot" | "guest") => {
      cleanup()
      render(<PrincipalTag kind={kind} />)
      return document.querySelector("[data-principal-tag]")!.className
    }
    expect(tag("ai")).toMatch(/bg-agent-muted.*text-agent-ink/)
    expect(tag("bot")).toMatch(/bg-hover.*ring-line/)
    expect(tag("guest")).toMatch(/bg-camp-sun-tint.*text-camp-sun-ink/)
  })

  it("draws kbd 18px, r4, 11/510 on the sheet with a line-2 ring and a bottom inset", () => {
    const k = utility("kbd")
    expect(k).toMatch(/height: 18px;/)
    expect(k).toMatch(/border-radius: var\(--radius-xs\);/)
    expect(k).toMatch(/background: var\(--sheet\);/)
    expect(k).toMatch(/box-shadow: 0 0 0 1px var\(--line-2\), inset 0 -1px 0 var\(--line-2\);/)
  })
})

describe("avatars", () => {
  it("fills a person with the hue's avatar cut at 140 degrees under white initials", () => {
    const a = utility("avatar-person")
    expect(a).toMatch(/linear-gradient\(140deg, var\(--hue-a1\), var\(--hue-a2\)\)/)
    expect(a).toMatch(/color: #fff;/)
    expect(a).toMatch(/font-weight: 600;/)
    expect(CSS).toMatch(/@utility hue-sky \{[^}]*--hue-a1: var\(--camp-sky-a1\);/)
  })

  it("draws an agent as a 32% square with the spark, and a bot as a neutral 32% square", () => {
    render(<div style={{ width: 36, height: 36 }}><AgentAvatar /></div>)
    const agent = document.querySelector("[data-agent-avatar] .avatar-agent")!
    expect(agent.className).toContain("rounded-[32%]")
    expect(agent.querySelector("path")!.getAttribute("d")).toBe(SPARK_PATH)
    cleanup()
    render(<BotAvatar>C</BotAvatar>)
    expect(document.querySelector("[data-bot-avatar] .avatar-bot")!.className).toContain("rounded-[32%]")
    expect(utility("avatar-bot")).toMatch(/background: var\(--sunken\);/)
  })

  it("puts presence at 30% of the avatar, 8px at least, in --ok with a surface ring", () => {
    const p = utility("presence-dot")
    expect(p).toMatch(/width: 30%;/)
    expect(p).toMatch(/min-width: 8px;/)
    expect(p).toMatch(/background: var\(--ok\);/)
    expect(p).toMatch(/box-shadow: 0 0 0 2px var\(--presence-ring, var\(--sheet\)\);/)
  })
})

describe("the owned glyphs", () => {
  it("draws each status as the spec's glyph", () => {
    const glyph = (status: Parameters<typeof StatusGlyph>[0]["status"]) => {
      cleanup()
      render(<StatusGlyph status={status} />)
      return document.querySelector("[data-status-glyph]")!.innerHTML
    }
    expect(glyph("backlog")).toMatch(/stroke-dasharray="2.2 2.1"/)
    expect(glyph("todo")).toMatch(/stroke="var\(--ink-2\)"/)
    expect(glyph("progress")).toMatch(/var\(--camp-sun\)[\s\S]*M8 4.5a3.5 3.5 0 0 1 0 7z/)
    expect(glyph("review")).toMatch(/var\(--camp-dusk\)/)
    expect(glyph("done")).toMatch(/fill="var\(--camp-moss\)"/)
    expect(glyph("cancelled")).toMatch(/fill="var\(--ink-3\)"/)
  })

  it("draws priority as three bars, and urgent as a danger square with !", () => {
    render(<PriorityGlyph level={2} />)
    const bars = [...document.querySelectorAll("[data-priority-glyph] rect")].map((r) => r.getAttribute("fill"))
    expect(bars).toEqual(["var(--ink-2)", "var(--ink-2)", "var(--ink-4)"])
    cleanup()
    render(<PriorityGlyph level={4} />)
    expect(document.querySelector("[data-priority-glyph] rect")!.getAttribute("fill")).toBe("var(--destructive)")
  })
})

describe("tabs", () => {
  it("are a 40px row whose open tab is ink at 510 over a rounded 2px ink rule, inset 8px", () => {
    expect(underlineTabsList).toContain("h-10")
    expect(underlineTab).toMatch(/after:inset-x-2 .*after:h-0\.5 .*after:rounded-full/)
    expect(underlineTab).toContain("data-[state=active]:after:bg-foreground")
    expect(underlineTab).toContain("data-[state=active]:font-medium")
    expect(underlineTab).toContain("[&_svg]:size-3.5")
  })
})
