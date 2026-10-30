import { afterEach, describe, expect, it } from "vitest"

import { markPrintPath } from "./printRoot"

// A part of a page printed alone (app/globals.css): the boxes around it carry
// data-print-path, which the print rules key on instead of a :has().
describe("the boxes around a print root", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  const page = () => {
    document.body.innerHTML = `<div id="shell"><aside id="side"></aside><main id="main"><div id="root"></div><div id="root2"></div></main></div>`
    const $ = (id: string) => document.getElementById(id)!
    return { shell: $("shell"), side: $("side"), main: $("main"), root: $("root"), root2: $("root2") }
  }
  const marked = () => [...document.querySelectorAll("[data-print-path]")].map((el) => el.id || el.tagName.toLowerCase())

  it("are marked up to <html>, and only they: not the root, nor what sits beside them", () => {
    const { root } = page()
    const undo = markPrintPath(root)
    expect(marked()).toEqual(["html", "body", "shell", "main"])
    undo()
    expect(marked()).toEqual([])
  })

  it("keep a mark two roots share until the second lets it go", () => {
    const { root, root2 } = page()
    const one = markPrintPath(root)
    const two = markPrintPath(root2)
    one()
    expect(marked()).toEqual(["html", "body", "shell", "main"])
    two()
    expect(marked()).toEqual([])
  })

  it("leave a mark written by hand where it was", () => {
    const { root, shell } = page()
    shell.setAttribute("data-print-path", "")
    markPrintPath(root)()
    expect(shell.hasAttribute("data-print-path")).toBe(true)
  })
})
