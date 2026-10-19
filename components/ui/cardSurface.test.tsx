import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

// SHADCN-AUDIT (17 Oct 2026): Card still drew the pre-v3 card, a 1 px border
// on the sheet. Design v3 (DESIGN_V3 §2, admin §1.3): a card is a raised
// surface, r12 and e1, with no border. And shadcn's CardAction, a header's
// action placed by the header's grid, was missing: a card with a header
// action laid it out by hand. One primitive change: the surface and the slot.

afterEach(cleanup)

const classes = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/)

describe("the card's surface (design v3)", () => {
  it("is raised: r12, e1, the card ground, and no border", () => {
    const { container } = render(<Card>Billing</Card>)
    const card = classes(container.firstElementChild)
    expect(card).toEqual(expect.arrayContaining(["rounded-lg", "shadow-e1", "bg-card"]))
    expect(card.filter((c) => /^border(-|$)/.test(c))).toEqual([])
  })

  it("names its parts by slot, as shadcn's does", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Your plan and invoices.</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>,
    )
    const slots = Array.from(container.querySelectorAll("[data-slot]")).map((e) => e.getAttribute("data-slot"))
    expect(slots).toEqual(["card", "card-header", "card-title", "card-description", "card-content", "card-footer"])
  })
})

describe("a card header's action (CardAction)", () => {
  it("sits beside the title and description, top right, by the header's grid", () => {
    const { container } = render(
      <CardHeader>
        <CardTitle>What the AI did for you</CardTitle>
        <CardDescription>Every action an agent took as you.</CardDescription>
        <CardAction>
          <button type="button">Download the record</button>
        </CardAction>
      </CardHeader>,
    )
    const header = classes(container.querySelector("[data-slot='card-header']"))
    expect(header).toEqual(expect.arrayContaining(["grid", "has-data-[slot=card-action]:grid-cols-[1fr_auto]"]))
    const action = classes(container.querySelector("[data-slot='card-action']"))
    expect(action).toEqual(expect.arrayContaining(["col-start-2", "row-span-2", "row-start-1", "self-start", "justify-self-end"]))
    expect(screen.getByRole("button", { name: "Download the record" })).toBeTruthy()
  })

  it("goes under the description in a narrow header, so the title keeps its width", () => {
    const { container } = render(
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardAction>
          <button type="button">Change plan</button>
        </CardAction>
      </CardHeader>,
    )
    const action = classes(container.querySelector("[data-slot='card-action']"))
    expect(action).toEqual(
      expect.arrayContaining([
        "@max-[24rem]/card-header:col-start-1",
        "@max-[24rem]/card-header:row-start-3",
        "@max-[24rem]/card-header:justify-self-start",
      ]),
    )
    expect(classes(container.querySelector("[data-slot='card-header']"))).toContain("@container/card-header")
  })
})

// The surface is the primitive's: a call site that draws its own border on a
// Card brings the pre-v3 look back one page at a time. A Card used as a plain
// container says so with border-none (or border-0).
describe("Card call sites", () => {
  const ROOT = process.cwd()
  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue
      const p = join(dir, name)
      if (statSync(p).isDirectory()) sources(p, out)
      else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) out.push(p)
    }
    return out
  }
  it("never give a Card a border of its own", () => {
    const found: string[] = []
    for (const file of ["app", "components"].flatMap((d) => sources(join(ROOT, d)))) {
      const src = readFileSync(file, "utf8")
      if (!src.includes('from "@/components/ui/card"')) continue
      for (const m of src.matchAll(/<Card\s[^>]*className=["{`]+([^"`}]*)/g)) {
        const bordered = m[1].split(/\s+/).filter((c) => /^border(-(?!none$|0$)[\w/[\]-]+)?$/.test(c))
        if (bordered.length) found.push(`${relative(ROOT, file)}: ${bordered.join(" ")}`)
      }
    }
    expect(found, found.join("\n")).toEqual([])
  })
})
