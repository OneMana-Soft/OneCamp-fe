import { describe, expect, it } from "vitest"
import { boardEmbedOf, cardElement, cardLink, cardLinksIn, cardSize, cardsAt, isCard, layCards, linkPopupOverCard, onlyCardsSelected } from "./cards"
import { boardScene } from "@/lib/testing/boardScene"

const APP = "https://app.example.com"
const where = { origin: APP, adminHosts: [] as string[], isCardKind: (k: string) => k === "task" || k === "doc" }

describe("boardEmbedOf: what a link on the board draws", () => {
  it("a OneCamp thing whose kind has a card is a card, read live", () => {
    expect(boardEmbedOf(`${APP}/app/task/t1`, where)).toEqual({ card: { kind: "task", id: "t1" } })
    expect(boardEmbedOf("/app/doc/d1", where)).toEqual({ card: { kind: "doc", id: "d1" } })
  })

  it("a page of the app with no card is never framed: the app is never framed inside itself", () => {
    expect(boardEmbedOf(`${APP}/app/channel/c1`, where)).toBeNull()
    expect(boardEmbedOf(`${APP}/app/settings`, where)).toBeNull()
  })

  it("another site is framed only from the docs' own allow-list, with its rules", () => {
    const yt = boardEmbedOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ", where)
    expect(yt && "frame" in yt && yt.frame.provider).toBe("youtube")
    expect(yt && "frame" in yt && yt.frame.sandbox).not.toContain("allow-top-navigation")
    expect(boardEmbedOf("https://unknown.example.org/page", where)).toBeNull()
    const admin = boardEmbedOf("https://wiki.corp.example/page", { ...where, adminHosts: ["wiki.corp.example"] })
    expect(admin && "frame" in admin && admin.frame.provider).toBe("site")
  })
})

describe("cards on the canvas", () => {
  it("a card is an embeddable that keeps its link and says it is a card", () => {
    const el = cardElement({ id: "c1", x: 10, y: 20, link: `${APP}/app/task/t1`, kind: "task" })
    expect(el).toMatchObject({ id: "c1", type: "embeddable", x: 10, y: 20, link: `${APP}/app/task/t1`, customData: { kind: "card" }, isDeleted: false, version: 1 })
    expect(el.width).toBe(cardSize("task").width)
    expect(el.height).toBe(cardSize("task").height)
    expect(cardSize("doc").height).toBeLessThan(cardSize("task").height)
    expect(isCard(el)).toBe(true)
    expect(isCard({ type: "embeddable", customData: {} })).toBe(false)
    expect(isCard({ type: "rectangle", customData: { kind: "card" } })).toBe(false)
  })

  it("only text that is nothing but card links pastes as cards", () => {
    expect(cardLinksIn(`${APP}/app/task/t1\n\n ${APP}/app/doc/d1 `, where)).toEqual([
      { link: `${APP}/app/task/t1`, kind: "task" },
      { link: `${APP}/app/doc/d1`, kind: "doc" },
    ])
    expect(cardLinksIn(`see ${APP}/app/task/t1`, where)).toEqual([])
    expect(cardLinksIn(`${APP}/app/task/t1\nhello`, where)).toEqual([])
    expect(cardLinksIn("/app/task/t1", where)).toEqual([{ link: `${APP}/app/task/t1`, kind: "task" }])
    expect(cardLinksIn("", where)).toEqual([])
  })

  it("cards placed together sit in a row, centred on the point", () => {
    const at = cardsAt({ x: 500, y: 300 }, ["task", "task"])
    const w = cardSize("task").width
    expect(at[0].y).toBe(300 - cardSize("task").height / 2)
    expect(at[1].x - at[0].x).toBe(w + 24)
    expect((at[0].x + at[1].x + w) / 2).toBe(500)
  })
})

describe("cards laid from a list (miro-13 2)", () => {
  const TASK = cardSize("task")
  const box = (id: string, x: number, y: number, w = 200, h = 200) => ({ id, type: "rectangle", x, y, width: w, height: h, version: 1 })

  it("a card's link is the thing's page on the app's own origin, as a paste writes it", () => {
    expect(cardLink(`${APP}/app/board/b1?x=1`, "task", "t1")).toBe(`${APP}/app/task/t1`)
    expect(cardLinksIn(cardLink(APP, "doc", "d1"), where)).toEqual([{ link: `${APP}/app/doc/d1`, kind: "doc" }])
  })

  it("laying cards adds them to the scene, selected, as one undo step, and says which they are", () => {
    const s = boardScene([box("n1", 0, 0) as never])
    const ids = layCards(s.api, [{ link: `${APP}/app/task/t1`, kind: "task" }], { x: 500, y: 400 })
    expect(ids).toHaveLength(1)
    expect(s.writes).toHaveLength(1)
    expect(s.writes[0].captureUpdate).toBe("IMMEDIATELY")
    const card = s.byId(ids[0])!
    expect(card).toMatchObject({ type: "embeddable", link: `${APP}/app/task/t1`, customData: { kind: "card" }, x: 500 - TASK.width / 2, y: 400 - TASK.height / 2 })
    expect(s.byId("n1")).toBeTruthy()
    expect(s.writes[0].appState?.selectedElementIds).toEqual({ [ids[0]]: true })
  })
})

describe("Excalidraw's link popup over a card (W6-A2)", () => {
  const card = { id: "c1", type: "embeddable", customData: { kind: "card" } }
  const link = { id: "l1", type: "rectangle", link: "https://example.com", customData: null }
  it("is over a card only when the one thing selected is a card and the popup is open", () => {
    expect(linkPopupOverCard([card, link], { showHyperlinkPopup: "info", selectedElementIds: { c1: true } })).toBe(true)
    expect(linkPopupOverCard([card, link], { showHyperlinkPopup: "editor", selectedElementIds: { c1: true } })).toBe(true)
    expect(linkPopupOverCard([card, link], { showHyperlinkPopup: false, selectedElementIds: { c1: true } })).toBe(false)
    expect(linkPopupOverCard([card, link], { showHyperlinkPopup: "info", selectedElementIds: { l1: true } })).toBe(false)
    expect(linkPopupOverCard([card, link], { showHyperlinkPopup: "info", selectedElementIds: { c1: true, l1: true } })).toBe(false)
    expect(linkPopupOverCard([card, link], { showHyperlinkPopup: "info", selectedElementIds: { c1: false } as Record<string, boolean> })).toBe(false)
    expect(linkPopupOverCard([link], { showHyperlinkPopup: "info", selectedElementIds: { c1: true } })).toBe(false)
  })
})

describe("only cards selected (W6-A2, DB-56 MUST 1)", () => {
  const card = { id: "c1", type: "embeddable", customData: { kind: "card" } }
  const card2 = { id: "c2", type: "embeddable", customData: { kind: "card" } }
  const shape = { id: "s1", type: "rectangle", customData: null }
  it("holds while everything selected is a card, so the board hides Excalidraw's style panel, which means nothing for one", () => {
    expect(onlyCardsSelected([card, shape], { selectedElementIds: { c1: true } })).toBe(true)
    expect(onlyCardsSelected([card, card2, shape], { selectedElementIds: { c1: true, c2: true } })).toBe(true)
  })
  it("never with a shape in the selection, with nothing selected, or for an id no longer on the board", () => {
    expect(onlyCardsSelected([card, shape], { selectedElementIds: { c1: true, s1: true } })).toBe(false)
    expect(onlyCardsSelected([card, shape], { selectedElementIds: {} })).toBe(false)
    expect(onlyCardsSelected([card, shape], { selectedElementIds: { c1: false } as Record<string, boolean> })).toBe(false)
    expect(onlyCardsSelected([shape], { selectedElementIds: { c1: true } })).toBe(false)
  })
})
