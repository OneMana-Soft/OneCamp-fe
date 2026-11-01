import { describe, expect, it } from "vitest"
import { CONTAINER } from "./excalidrawPart"
import { islandsOver } from "./islands"

describe("islandsOver, what floats over a board's canvas", () => {
  const boxed = (el: HTMLElement, left: number, top: number, width: number, height: number) => {
    el.getBoundingClientRect = () => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) })
    return el
  }
  it("is Excalidraw's islands and the board's own chrome, in the scene; never the bar that follows a selection, nor what isn't drawn", () => {
    const root = document.createElement("div")
    const container = root.appendChild(document.createElement("div"))
    container.className = CONTAINER.slice(1)
    boxed(container.appendChild(Object.assign(document.createElement("div"), { className: "Island App-toolbar" })), 400, 700, 300, 50)
    boxed(root.appendChild(Object.assign(document.createElement("aside"), { className: "panel" })), 900, 100, 300, 250).setAttribute("data-board-chrome", "")
    const following = root.appendChild(document.createElement("div"))
    following.setAttribute("data-following-bar", "")
    boxed(following.appendChild(document.createElement("div")), 500, 300, 200, 40).setAttribute("data-board-chrome", "")
    // Hidden (display: none draws no box).
    boxed(root.appendChild(document.createElement("div")), 0, 0, 0, 0).setAttribute("data-board-chrome", "")
    const view = { scrollX: -100, scrollY: 0, zoom: 2, width: 1000, height: 800, offsetLeft: 200, offsetTop: 100 }
    expect(islandsOver(view, root)).toEqual([
      { x: 200, y: 300, width: 150, height: 25 },
      { x: 450, y: 0, width: 150, height: 125 },
    ])
  })
})
