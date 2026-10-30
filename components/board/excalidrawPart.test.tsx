import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { CONTAINER, PHONE_UI, PHONE_UI_BELOW, drawsPhoneUI, useExcalidrawPhoneUI } from "./excalidrawPart"

afterEach(cleanup)

describe("drawsPhoneUI, Excalidraw's own rule for its phone UI on its box", () => {
  it("is under 730 wide at any height, and under 500 tall and 1000 wide", () => {
    expect(drawsPhoneUI(729, 860)).toBe(true)
    expect(drawsPhoneUI(730, 860)).toBe(false)
    expect(drawsPhoneUI(999, 499)).toBe(true)
    expect(drawsPhoneUI(1000, 499)).toBe(false)
    expect(drawsPhoneUI(999, 500)).toBe(false)
    // The demo's boards: a 700 window (636 wide), 960 with the sidebar expanded (712), a tablet held upright (704).
    for (const width of [636, 712, 704]) expect(drawsPhoneUI(width, 840)).toBe(true)
  })

  it("holds the numbers of the Excalidraw this app installs, so an upgrade that moves them fails here", () => {
    const constants = readFileSync("node_modules/@excalidraw/excalidraw/dist/types/excalidraw/constants.d.ts", "utf8")
    expect(constants).toContain(`MQ_MAX_WIDTH_PORTRAIT = ${PHONE_UI_BELOW.width};`)
    expect(constants).toContain(`MQ_MAX_HEIGHT_LANDSCAPE = ${PHONE_UI_BELOW.landscapeHeight};`)
    expect(constants).toContain(`MQ_MAX_WIDTH_LANDSCAPE = ${PHONE_UI_BELOW.landscapeWidth};`)
    // Its rule, as its readable build has it, and the class it sets from it on its container.
    const app = readFileSync("node_modules/@excalidraw/excalidraw/dist/dev/index.js", "utf8")
    expect(app).toContain("return width < MQ_MAX_WIDTH_PORTRAIT || height < MQ_MAX_HEIGHT_LANDSCAPE && width < MQ_MAX_WIDTH_LANDSCAPE;")
    expect(app).toContain(`"${PHONE_UI}": this.device.editor.isMobile`)
    expect(app).toContain("isMobile: this.isMobileBreakpoint(editorWidth, editorHeight)")
  })
})

/** A board page's host, `width` x `height` as laid out, that may hold Excalidraw's container. */
function Probe({ host, seen }: { host: HTMLElement | null; seen: (phone: boolean) => void }) {
  seen(useExcalidrawPhoneUI(host))
  return null
}

function hostOf(width: number, height: number) {
  const host = document.createElement("div")
  host.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) })
  document.body.appendChild(host)
  return host
}

describe("useExcalidrawPhoneUI", () => {
  it("before Excalidraw is drawn, answers its rule on the host's box", () => {
    const answers: boolean[] = []
    render(<Probe host={hostOf(636, 844)} seen={(p) => answers.push(p)} />)
    expect(answers.at(-1)).toBe(true)
    const wide: boolean[] = []
    render(<Probe host={hostOf(1216, 844)} seen={(p) => wide.push(p)} />)
    expect(wide.at(-1)).toBe(false)
  })

  it("once Excalidraw is drawn, follows its own switch on its container, as Excalidraw swaps its UI", async () => {
    // The host's box says a computer: the container's class is what counts once it is there.
    const host = hostOf(1216, 844)
    const answers: boolean[] = []
    render(<Probe host={host} seen={(p) => answers.push(p)} />)
    expect(answers.at(-1)).toBe(false)
    const container = document.createElement("div")
    container.className = `${CONTAINER.slice(1)} excalidraw-container ${PHONE_UI}`
    container.appendChild(document.createElement("div")).className = "App-toolbar App-toolbar--mobile"
    await act(async () => host.appendChild(container))
    expect(answers.at(-1)).toBe(true)
    // Excalidraw takes its class off and swaps the MobileMenu for its desktop rows in one commit.
    await act(async () => {
      container.className = `${CONTAINER.slice(1)} excalidraw-container`
      container.replaceChildren(Object.assign(document.createElement("div"), { className: "App-menu_top" }))
    })
    expect(answers.at(-1)).toBe(false)
  })

  it("is a computer's answer with no host yet", () => {
    const answers: boolean[] = []
    render(<Probe host={null} seen={(p) => answers.push(p)} />)
    expect(answers).not.toContain(true)
  })
})
