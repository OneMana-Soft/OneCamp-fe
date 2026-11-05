import { describe, expect, it } from "vitest"

import { pressTab, tabStop } from "@/lib/keys/tabOrder"

/** A page of the given markup; `byId` reads its elements. */
function page(html: string) {
  document.body.innerHTML = html
  return (id: string) => document.getElementById(id)!
}

describe("tabStop: where the browser's Tab goes", () => {
  it("goes on as the page reads, and back on Shift+Tab, past what no Tab stops at", () => {
    const at = page(`
      <input id="a">
      <div tabindex="-1" id="minus">x</div>
      <button id="off" disabled>off</button>
      <fieldset disabled><input id="inFieldset"></fieldset>
      <input id="secret" type="hidden">
      <div style="display: none"><input id="gone"></div>
      <input id="unseen" style="visibility: hidden">
      <div inert><button id="asleep">z</button></div>
      <span>text</span>
      <a id="link" href="#x">link</a>
      <a id="noHref">no href</a>
      <textarea id="area"></textarea>
    `)
    expect(tabStop(at("a"))).toBe(at("link"))
    expect(tabStop(at("link"))).toBe(at("area"))
    expect(tabStop(at("area"))).toBeNull()
    expect(tabStop(at("area"), true)).toBe(at("link"))
    expect(tabStop(at("link"), true)).toBe(at("a"))
    expect(tabStop(at("a"), true)).toBeNull()
  })

  it("takes a positive tabindex first, by its number, then the rest as the page reads", () => {
    const at = page(`<input id="a"><input id="two" tabindex="2"><input id="b"><input id="one" tabindex="1">`)
    expect(tabStop(at("one"))).toBe(at("two"))
    expect(tabStop(at("two"))).toBe(at("a"))
    expect(tabStop(at("a"))).toBe(at("b"))
    expect(tabStop(at("a"), true)).toBe(at("two"))
  })

  it("goes from an element no Tab stops at to the next that one does, into what it holds first", () => {
    const at = page(`<input id="a"><div tabindex="-1" id="cell"><input id="inside"></div><p id="para">p</p><input id="b">`)
    expect(tabStop(at("cell"))).toBe(at("inside"))
    expect(tabStop(at("cell"), true)).toBe(at("a"))
    expect(tabStop(at("para"))).toBe(at("b"))
    expect(tabStop(at("para"), true)).toBe(at("inside"))
    expect(tabStop(document.body)).toBe(at("a"))
  })

  it("stops at one radio button of a group: its checked one, else its first (its last going back), and never within the group it leaves", () => {
    const at = page(`
      <input id="a">
      <input type="radio" name="size" id="s1"><input type="radio" name="size" id="s2" checked><input type="radio" name="size" id="s3">
      <input type="radio" name="tone" id="t1"><input type="radio" name="tone" id="t2">
      <input id="b">
    `)
    expect(tabStop(at("a"))).toBe(at("s2"))
    expect(tabStop(at("s2"))).toBe(at("t1"))
    expect(tabStop(at("t1"))).toBe(at("b"))
    expect(tabStop(at("b"), true)).toBe(at("t2"))
    expect(tabStop(at("t2"), true)).toBe(at("s2"))
    expect(tabStop(at("s1"), true)).toBe(at("a"))
  })
})

describe("pressTab", () => {
  it("moves the focus there, an input's text all selected, and blurs the element when there's nowhere to go", () => {
    const at = page(`<input id="a" value="Hall C"><input id="b" value="Print"><textarea id="area">line</textarea>`)
    const a = at("a") as HTMLInputElement
    const b = at("b") as HTMLInputElement
    a.focus()
    expect(pressTab(a)).toBe(b)
    expect(document.activeElement).toBe(b)
    expect([b.selectionStart, b.selectionEnd]).toEqual([0, "Print".length])
    expect(pressTab(b, true)).toBe(a)
    expect(document.activeElement).toBe(a)
    const area = at("area") as HTMLTextAreaElement
    area.focus()
    expect(pressTab(area)).toBeNull()
    expect(document.activeElement).toBe(document.body)
  })
})
