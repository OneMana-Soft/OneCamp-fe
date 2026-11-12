import { describe, expect, it } from "vitest"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { BOARD_ELEMENT_TYPES, isBoardElement } from "@/lib/board/elementTypes"

// The element types a board draws (V-547): the one list every way onto a board
// takes. The shared document, as a teammate changes it and as a stored board
// opens, for members and guests alike (./binding, both ways); a team's template
// and a .excalidraw file (./copyElements), and a template's preview
// (./teamTemplates); a paste (components/board/boardExcalidraw). An element of
// any other type, or of none, is dropped there and never drawn. The
// collaboration service holds the same list for every write and for a board as
// it opens (other-services/collaboration-service/live/ops/elementTypes.js); a
// type is added in both, here first.
//
// Left out: Excalidraw's "iframe", which it draws as a live page made from the
// element's own HTML (customData.generationData), with scripts, forms and
// popups that leave its sandbox, and "magicframe", the frame that makes one. We
// ship neither tool, so only a crafted client writes them, and to every viewer
// and guest one would be a page of its writer's choosing: a sign-in form that
// isn't ours. "selection" is Excalidraw's marquee, never an element of a scene.
// (The list's comments live here: lib/board/elementTypes.ts is on the board's
// first load, whose source line counts every byte.)

// Every type Excalidraw has, drawn or dropped: a type it adds fails tsc here until it is placed (V-547).
const EVERY: Record<ExcalidrawElement["type"], "drawn" | "dropped"> = {
  rectangle: "drawn",
  diamond: "drawn",
  ellipse: "drawn",
  arrow: "drawn",
  line: "drawn",
  freedraw: "drawn",
  text: "drawn",
  image: "drawn",
  frame: "drawn",
  embeddable: "drawn",
  // A live page from the element's own HTML, with scripts, forms and popups out of its sandbox; and the frame that makes one.
  iframe: "dropped",
  magicframe: "dropped",
  // The marquee: never an element of a scene.
  selection: "dropped",
}

describe("the types a board draws (V-547)", () => {
  it("are Excalidraw's own, less the live page, the frame that makes one, and the marquee", () => {
    const drawn = Object.entries(EVERY).flatMap(([type, as]) => (as === "drawn" ? [type] : []))
    expect([...BOARD_ELEMENT_TYPES].sort()).toEqual(drawn.sort())
  })

  it("takes an element of a type on the list, and nothing else", () => {
    expect(isBoardElement({ id: "a", type: "rectangle" })).toBe(true)
    expect(isBoardElement({ id: "a", type: "embeddable", link: "/app/code-block" })).toBe(true)
    for (const crafted of [
      { id: "a", type: "iframe", customData: { generationData: { status: "done", html: "<form action=//x>" } } },
      { id: "a", type: "magicframe" },
      { id: "a", type: "selection" },
      { id: "a", type: "script" },
      { id: "a", type: "Rectangle" },
      { id: "a", type: "toString" },
      { id: "a", type: ["rectangle"] },
      { id: "a" },
      null,
      "rectangle",
      undefined,
    ]) {
      expect(isBoardElement(crafted), JSON.stringify(crafted) ?? String(crafted)).toBe(false)
    }
  })
})
