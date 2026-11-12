import { afterEach, describe, expect, it } from "vitest"

import { isTypedInto } from "./typedInto"

// V-831: a table cell at rest is a readonly textarea (or input), and every
// textarea counted as a field being typed in, so the toasts' ⌥T was dropped
// across the whole grid. A field is typed into only while someone can type in
// it: never a readonly or a disabled one.

afterEach(() => document.body.replaceChildren())

function make(html: string): Element {
  document.body.innerHTML = html
  return document.querySelector("[data-t]")!
}

describe("isTypedInto", () => {
  it("is a field someone can type in, or an editor, or anything inside an editor", () => {
    expect(isTypedInto(make(`<textarea data-t></textarea>`))).toBe(true)
    expect(isTypedInto(make(`<input data-t>`))).toBe(true)
    expect(isTypedInto(make(`<input type="number" data-t>`))).toBe(true)
    expect(isTypedInto(make(`<select data-t><option>One</option></select>`))).toBe(true)
    expect(isTypedInto(make(`<div contenteditable="" data-t></div>`))).toBe(true)
    expect(isTypedInto(make(`<div contenteditable="true" data-t></div>`))).toBe(true)
    expect(isTypedInto(make(`<div contenteditable="true"><p><b data-t>Bold</b></p></div>`))).toBe(true)
  })

  it("is not a field nobody can type in right now: a readonly textarea or input (a table cell at rest)", () => {
    expect(isTypedInto(make(`<textarea readonly data-t></textarea>`))).toBe(false)
    expect(isTypedInto(make(`<input readonly data-t>`))).toBe(false)
    expect(isTypedInto(make(`<input type="email" readonly data-t>`))).toBe(false)
    const area = make(`<textarea data-t></textarea>`) as HTMLTextAreaElement
    area.readOnly = true
    expect(isTypedInto(area)).toBe(false)
    area.readOnly = false
    expect(isTypedInto(area)).toBe(true)
  })

  it("is not a disabled field, nor one in a disabled fieldset", () => {
    expect(isTypedInto(make(`<textarea disabled data-t></textarea>`))).toBe(false)
    expect(isTypedInto(make(`<input disabled data-t>`))).toBe(false)
    expect(isTypedInto(make(`<select disabled data-t><option>One</option></select>`))).toBe(false)
    expect(isTypedInto(make(`<fieldset disabled><input data-t></fieldset>`))).toBe(false)
  })

  it("is a readonly field inside an editor: the editor takes the keys", () => {
    expect(isTypedInto(make(`<div contenteditable="true"><input readonly data-t></div>`))).toBe(true)
  })

  it("is not anything else: a button, a plain box, a shut editor, no target", () => {
    expect(isTypedInto(make(`<button data-t>Filter</button>`))).toBe(false)
    expect(isTypedInto(make(`<div tabindex="-1" data-t></div>`))).toBe(false)
    expect(isTypedInto(make(`<div contenteditable="false" data-t></div>`))).toBe(false)
    expect(isTypedInto(null)).toBe(false)
    expect(isTypedInto(window)).toBe(false)
  })
})
