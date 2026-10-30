import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import "@/components/docEditor/registry"
// C5's actions register as its overlay's chunk loads beside the editor (suggest-mode/contributions.ts).
import "@/components/minimal-tiptap/extensions/suggest-mode/contributions"
import { actionGroupsFor } from "@/components/docEditor/registry/readers"
import { createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { PHONE_BAR_GROUPS, SELECTION_GROUPS, phoneBarGroups } from "@/components/docEditor/actions/text"

const src = readFileSync("components/docEditor/docInput.tsx", "utf8")
const bar = readFileSync("components/docEditor/SelectionBar.tsx", "utf8")

// content.md D08: no permanent formatting row. Formatting floats on a
// selection; a phone gets a bar above its keyboard instead.
describe("the doc's formatting", () => {
  it("has no toolbar row at rest on a computer", () => {
    expect(src).not.toMatch(/data-doc-toolbar/)
    expect(src).toMatch(/\(canEdit \|\| readerBar\) && !isMobile && \(\s*<SelectionBar/)
  })

  it("floats on a selection: Turn into, bold first, the link, then the other groups (B2's Colour, Comment)", () => {
    expect(bar).toMatch(/<BubbleMenu/)
    expect(bar).toMatch(/<FloatingBar /)
    // Its actions are registered (actions/text.ts), in its groups' order; this
    // edition registers no Ask AI, even with the gate open.
    const editor = { isActive: () => false, state: { selection: { empty: false } } } as unknown as ActionContext["editor"]
    const ctx: ActionContext = { docId: "d", editor, canEdit: true, bus: createDocCommandBus("d"), gate: { ai: true } }
    expect(actionGroupsFor("selection", ctx, SELECTION_GROUPS).map((g) => [g.group, g.actions.map((a) => a.label)])).toEqual([
      ["marks", ["Bold", "Italic", "Underline", "Strikethrough", "Inline code"]],
      // C5's Suggest edit beside Comment (minimal-tiptap/extensions/suggest-mode/contributions.ts).
      ["comment", ["Comment", "Suggest edit"]],
    ])
    // The bar's own pieces sit between them: Turn into first, the link after the marks. The colour is
    // B2's registered colour.open (group "style", before Comment), not a button of the bar's own.
    expect(SELECTION_GROUPS.indexOf("style")).toBe(SELECTION_GROUPS.indexOf("comment") - 1)
    expect(bar).not.toMatch(/Text colour/)
    const jsx = bar.slice(bar.indexOf("<BubbleMenu"))
    const order = ["Turn into", 'actionsIn("marks")', '"Remove link"', 'g.group !== "ai" && g.group !== "marks"']
    const at = order.map((l) => jsx.indexOf(l))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  // QA DSA-24 (14 Oct 2026): with text selected on a phone, what a selection
  // is for came 16th of 18 in the bar, off the screen until it scrolled. On
  // this edition that is Comment.
  it("on a phone, puts Comment first while text is selected, and the marks first while typing", () => {
    const editor = (empty: boolean) => ({ isActive: () => false, isEditable: true, can: () => ({ chain: () => ({ focus: () => ({}) }) }), state: { selection: { empty } } }) as unknown as ActionContext["editor"]
    const first = (empty: boolean) => {
      const ctx: ActionContext = { docId: "d", editor: editor(empty), canEdit: true, bus: createDocCommandBus("d"), gate: { ai: true } }
      return actionGroupsFor("phoneBar", ctx, phoneBarGroups(empty), { disabled: "show" }).map((g) => g.group).slice(0, 2)
    }
    expect(first(false)[0]).toBe("comment")
    expect(phoneBarGroups(true)).toBe(PHONE_BAR_GROUPS)
    expect(first(true)[0]).toBe("marks")
  })

  // The touch guard over dense rows (coordinator, 14 Oct 2026; e2e/
  // touchTargets.spec on the main branch): on a phone the doc's rows are the
  // bar above the keyboard, whose every button is drawn 44px and 4px apart,
  // so no tap can reach a neighbour; the floating selection bar is a
  // computer's only.
  it("on a phone, draws every bar button 44px across, 4px apart, and no floating bar", () => {
    const phoneBar = readFileSync("components/docEditor/DocAccessoryBar.tsx", "utf8")
    expect(phoneBar).toMatch(/const btn = \(active\?: boolean\) =>\s*cn\(\s*"inline-flex size-11 /)
    for (const row of phoneBar.match(/<div className="flex h-11 items-center gap-\S+ /g) ?? []) expect(row).toContain("gap-1 ")
    expect(phoneBar.match(/<div className="flex h-11 items-center gap-\S+ /g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).toMatch(/\(canEdit \|\| readerBar\) && !isMobile && \(\s*<SelectionBar/)
  })

  it("reaches the bar from the keyboard (Alt-F10)", () => {
    expect(bar).toMatch(/e\.altKey && e\.key === "F10"/)
  })

  it("follows the editor itself, so typing doesn't render the frame", () => {
    expect(bar).toMatch(/useEditorState\(/)
    expect(src).toMatch(/useDocEditor\(/)
    expect(readFileSync("components/docEditor/useDocEditor.ts", "utf8")).toMatch(/shouldRerenderOnTransaction:\s*false/)
  })

  it("docks a bar above the phone's keyboard instead, whose code only a phone fetches", () => {
    expect(src).toMatch(/canEdit && isMobile && !focusMode && \(?\s*<AccessoryBar\.Part/)
    expect(src).toMatch(/lazyPart\(\(\) => import\('@\/components\/docEditor\/DocAccessoryBar'\)/)
  })
})

describe("a doc on a phone", () => {
  const view = readFileSync("components/views/DocView.tsx", "utf8")
  it("adds no bar of its own under the app bar unless someone else is here", () => {
    expect(view).toMatch(/isMobile && awarenessUsers\.length > 1 &&/)
    const phoneRow = view.slice(view.indexOf("data-doc-presence-row"), view.indexOf("data-doc-presence-row") + 300)
    expect(phoneRow).not.toMatch(/DocHeader/)
  })
})
