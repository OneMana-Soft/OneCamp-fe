import { afterEach, describe, expect, it } from "vitest"
import { CHANGE_ATTR, changeTargets, renderDiff } from "./index"
import { forgetMadeVersions } from "../preview/materialize"
import { renderVersion } from "../preview/renderVersion"

// A version's changes, drawn into its preview: the blocks lined up by their
// ids at every depth, a list's items one by one, and what went put back where
// it stood. Through the real sanitiser and the editor's dressing.

afterEach(forgetMadeVersions)

const list = (items: Array<[string, string]>) =>
  `<ul data-block-id="list">${items.map(([id, text]) => `<li data-block-id="li-${id}"><p data-block-id="p-${id}">${text}</p></li>`).join("")}</ul>`

async function diff(before: string, after: string) {
  const box = document.createElement("div")
  const stats = await renderDiff(box, before, after)
  return { box, stats, marked: (change: string) => Array.from(box.querySelectorAll(`[${CHANGE_ATTR}="${change}"]`)) }
}

describe("a version's changes", () => {
  it("marks the one item of a long list that changed, with its words, and leaves the list and the rest alone", async () => {
    const before = list([["a", "Book the room"], ["b", "Send the invite"], ["c", "Order lunch"]])
    const after = list([["a", "Book the room"], ["b", "Send the invite to Acme"], ["c", "Order lunch"]])
    const { box, stats, marked } = await diff(before, after)
    expect(marked("changed").map((el) => el.getAttribute("data-block-id"))).toEqual(["p-b"])
    expect(box.querySelector("ul")!.hasAttribute(CHANGE_ATTR)).toBe(false)
    expect(box.querySelector("ins.history-ins")!.textContent).toBe("to Acme")
    expect(stats).toMatchObject({ changed: 1, added: 0, removed: 0, wordsAdded: 2 })
  })

  it("puts an item that went back into its list, where it stood, struck", async () => {
    const before = list([["a", "One"], ["b", "Two"], ["c", "Three"]])
    const after = list([["a", "One"], ["c", "Three"]])
    const { box, marked } = await diff(before, after)
    const items = Array.from(box.querySelectorAll("ul > li"))
    expect(items.map((li) => li.textContent)).toEqual(["One", "Two", "Three"])
    expect(marked("removed")).toEqual([items[1]])
    // An item keeps its role in its list.
    expect(items[1].getAttribute("role")).toBeNull()
  })

  it("puts a removed paragraph back between the two it stood between, said as a deletion", async () => {
    const before = '<p data-block-id="1">Keep</p><p data-block-id="2">Gone</p><p data-block-id="3">Also kept</p>'
    const after = '<p data-block-id="1">Keep</p><p data-block-id="3">Also kept</p><p data-block-id="4">New at the end</p>'
    const { box, marked, stats } = await diff(before, after)
    expect(Array.from(box.children).map((el) => el.textContent)).toEqual(["Keep", "Gone", "Also kept", "New at the end"])
    expect(marked("removed")[0].getAttribute("role")).toBe("deletion")
    expect(marked("added")[0].getAttribute("role")).toBe("insertion")
    // Whole blocks count their words too: "Gone" out, "New at the end" in.
    expect(stats).toMatchObject({ added: 1, removed: 1, changed: 0, wordsAdded: 4, wordsRemoved: 1 })
  })

  it("marks a block whose words stayed but whose formatting changed, with nothing to strike", async () => {
    const { box, marked } = await diff('<p data-block-id="1">Ship it</p>', '<p data-block-id="1">Ship <strong>it</strong></p>')
    expect(marked("changed")).toHaveLength(1)
    expect(box.querySelector("ins, del")).toBeNull()
  })

  it("marks a checklist item ticked since", async () => {
    const item = (checked: boolean) =>
      `<ul data-type="taskList" data-block-id="t"><li data-type="taskItem" data-checked="${checked}" data-block-id="ti"><label><input type="checkbox"><span></span></label><div><p data-block-id="tp">Book the room</p></div></li></ul>`
    const { marked } = await diff(item(false), item(true))
    expect(marked("changed").map((el) => el.getAttribute("data-block-id"))).toEqual(["ti"])
  })

  it("shows an image swapped as the old one struck and the new one added", async () => {
    const { box, marked } = await diff('<img data-block-id="i" src="https://x.test/a.png">', '<img data-block-id="i" src="https://x.test/b.png">')
    expect(Array.from(box.querySelectorAll("img")).map((img) => [img.getAttribute("src"), img.getAttribute(CHANGE_ATTR)])).toEqual([
      ["https://x.test/a.png", "removed"],
      ["https://x.test/b.png", "added"],
    ])
    expect(marked("changed")).toHaveLength(0)
  })

  it("lines up a body saved before blocks had ids by its words", async () => {
    const { box, marked } = await diff("<p>Intro</p><p>We ship on Thursday</p><p>Outro</p>", "<p>Intro</p><p>We ship on Friday</p><p>Outro</p>")
    expect(marked("changed")).toHaveLength(1)
    expect(box.querySelector("del.history-del")!.textContent).toBe("Thursday")
    expect(box.querySelector("ins.history-ins")!.textContent).toBe("Friday")
  })

  it("draws nothing a version's body smuggled in", async () => {
    const { box } = await diff("<p>Safe</p>", '<p>Safe</p><p><img src=x onerror="alert(1)">Still</p><script>alert(2)</script>')
    expect(box.innerHTML).not.toMatch(/onerror|<script/)
  })

  it("steps through runs of changes, a change inside a marked block being part of it", async () => {
    const before = '<p data-block-id="1">A</p><p data-block-id="2">B</p><p data-block-id="3">C</p><p data-block-id="4">D</p>'
    const after = '<p data-block-id="1">A changed</p><p data-block-id="2">B changed</p><p data-block-id="3">C</p><p data-block-id="4">D changed</p>'
    const { box } = await diff(before, after)
    expect(changeTargets(box).map((el) => el.getAttribute("data-block-id"))).toEqual(["1", "4"])
  })
})

describe("a version read without its changes", () => {
  it("is the version as the editor draws it, ids kept, nothing marked", async () => {
    const box = document.createElement("div")
    const stats = await renderVersion(box, list([["a", "One"], ["b", "Two"]]), { key: "v1" })
    expect(stats.blocks).toBe(1)
    expect(box.querySelectorAll("[data-block-id]")).toHaveLength(5)
    expect(box.querySelector(`[${CHANGE_ATTR}]`)).toBeNull()
    // Read again, it is a copy of what was made: changing one never reaches the next.
    box.querySelector("p")!.textContent = "Scribbled"
    const again = document.createElement("div")
    await renderVersion(again, "<p>never read: the version is known</p>", { key: "v1" })
    expect(again.querySelector("p")!.textContent).toBe("One")
  })
})
