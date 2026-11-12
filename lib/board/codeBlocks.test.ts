import { describe, expect, it } from "vitest"
import { boardScene } from "@/lib/testing/boardScene"
import { CODE_MAX, changeCodeBlock, codeBlockElement, codeBlockLink, codeBlockOf, codeBlockSize, codeLines, isCodeBlock, isCodeBlockLink, layCodeBlock } from "@/lib/board/codeBlocks"

const ORIGIN = "https://acme.onecamp.test"
const block = { code: "const a = 1\nconst b = 2", language: "typescript", title: "Setup" }

describe("a code block on a board", () => {
  it("is one embeddable with its code, language and title in customData, and the fixed code link", () => {
    const el = codeBlockElement({ id: "k1", x: 10, y: 20, origin: ORIGIN, block })
    expect(el).toMatchObject({ id: "k1", type: "embeddable", x: 10, y: 20, link: `${ORIGIN}/app/code-block`, locked: false })
    expect(el.customData).toEqual({ kind: "code", code: block.code, language: "typescript", title: "Setup" })
    expect(isCodeBlock(el)).toBe(true)
    expect(codeBlockOf(el)).toEqual(block)
  })

  it("is told from cards, other embeddables and shapes", () => {
    expect(isCodeBlock({ type: "embeddable", customData: { kind: "card" } })).toBe(false)
    expect(isCodeBlock({ type: "embeddable", customData: null })).toBe(false)
    expect(isCodeBlock({ type: "rectangle", customData: { kind: "code" } })).toBe(false)
    expect(isCodeBlock({ type: "iframe", customData: { kind: "code" } })).toBe(false)
    expect(isCodeBlock(null)).toBe(false)
  })

  it("keeps the code out of its link: one fixed path on the app's origin, nothing after it", () => {
    expect(codeBlockLink(`${ORIGIN}/app/board/b1?x=1`)).toBe(`${ORIGIN}/app/code-block`)
    expect(isCodeBlockLink(`${ORIGIN}/app/code-block`, ORIGIN)).toBe(true)
    expect(isCodeBlockLink("/app/code-block", ORIGIN)).toBe(true)
    expect(isCodeBlockLink(`${ORIGIN}/app/code-block?code=secret`, ORIGIN)).toBe(false)
    expect(isCodeBlockLink(`${ORIGIN}/app/code-block#x`, ORIGIN)).toBe(false)
    expect(isCodeBlockLink(`${ORIGIN}/app/code-block/1`, ORIGIN)).toBe(false)
    expect(isCodeBlockLink("https://evil.example/app/code-block", ORIGIN)).toBe(false)
    expect(isCodeBlockLink("javascript:alert(1)", ORIGIN)).toBe(false)
    expect(isCodeBlockLink("not a url", "not an origin")).toBe(false)
  })

  it("reads anything missing or malformed as empty, and cuts what is too long", () => {
    const of = (customData: Record<string, unknown>) => codeBlockOf({ type: "embeddable", customData: { kind: "code", ...customData } })
    expect(of({})).toEqual({ code: "", language: null, title: "" })
    expect(of({ code: 5, language: { x: 1 }, title: ["t"] })).toEqual({ code: "", language: null, title: "" })
    expect(of({ language: "<img src=x onerror=alert(1)>" })?.language).toBeNull()
    expect(of({ language: "c++" })?.language).toBe("c++")
    expect(of({ code: "x".repeat(CODE_MAX + 50) })?.code).toHaveLength(CODE_MAX)
    expect(of({ title: "t".repeat(500) })?.title).toHaveLength(120)
    expect(codeBlockOf({ type: "embeddable", customData: { kind: "card" } })).toBeNull()
  })

  it("numbers its lines from 1, whatever the line endings", () => {
    expect(codeLines("a\r\nb\rc\nd")).toEqual([
      { n: 1, text: "a" },
      { n: 2, text: "b" },
      { n: 3, text: "c" },
      { n: 4, text: "d" },
    ])
    expect(codeLines("")).toEqual([{ n: 1, text: "" }])
  })

  it("is placed at the size of its code, within bounds", () => {
    expect(codeBlockSize("")).toEqual({ width: 320, height: 96 })
    const wide = codeBlockSize("x".repeat(80))
    expect(wide.width).toBeGreaterThan(320)
    expect(codeBlockSize("x".repeat(5000)).width).toBe(960)
    const tall = codeBlockSize(Array.from({ length: 10 }, () => "x").join("\n"))
    expect(tall.height).toBe(40 + 10 * 20 + 24)
    expect(codeBlockSize(Array.from({ length: 500 }, () => "x").join("\n")).height).toBe(640)
  })

  it("is made from a block that is cleaned first", () => {
    const el = codeBlockElement({ id: "k2", x: 0, y: 0, origin: ORIGIN, block: { code: "y", language: "bad lang!", title: "t" } })
    expect(el.customData.language).toBeNull()
  })
})

describe("a code block made and changed on a board (miro-17)", () => {
  const block = { code: "const a = 1\nreturn a", language: "javascript", title: "a.js" }

  it("is laid centred where the person is looking, selected, as one undo step", () => {
    const s = boardScene([{ id: "n1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, version: 1 } as never])
    const id = layCodeBlock(s.api, block, { x: 500, y: 400 }, ORIGIN)
    const size = codeBlockSize(block.code)
    expect(s.writes).toHaveLength(1)
    expect(s.writes[0].captureUpdate).toBe("IMMEDIATELY")
    expect(s.writes[0].appState?.selectedElementIds).toEqual({ [id]: true })
    expect(s.byId(id)).toMatchObject({ type: "embeddable", link: codeBlockLink(ORIGIN), x: 500 - size.width / 2, y: 400 - size.height / 2 })
    expect(codeBlockOf(s.byId(id) as never)).toEqual(block)
    expect(s.byId("n1")).toBeTruthy()
  })

  it("changes its code, language and title in place, cleaned, as one undo step with a new version", () => {
    const el = codeBlockElement({ id: "k1", x: 0, y: 0, origin: ORIGIN, block })
    const s = boardScene([el as never])
    expect(changeCodeBlock(s.api, "k1", { code: "x".repeat(CODE_MAX + 5), language: "no such lang!", title: "b" })).toBe(true)
    expect(s.writes).toHaveLength(1)
    expect(s.writes[0].captureUpdate).toBe("IMMEDIATELY")
    const now = s.byId("k1") as never as { version: number; width: number; link: string }
    expect(now.version).toBe(el.version + 1)
    expect(now.width).toBe(el.width)
    expect(now.link).toBe(el.link)
    expect(codeBlockOf(now as never)).toEqual({ code: "x".repeat(CODE_MAX), language: null, title: "b" })
  })

  it("changes nothing that isn't a live code block", () => {
    const s = boardScene([
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, version: 1 } as never,
      { ...codeBlockElement({ id: "k2", x: 0, y: 0, origin: ORIGIN, block }), isDeleted: true } as never,
    ])
    expect(changeCodeBlock(s.api, "r1", block)).toBe(false)
    expect(changeCodeBlock(s.api, "k2", block)).toBe(false)
    expect(changeCodeBlock(s.api, "gone", block)).toBe(false)
    expect(s.writes).toHaveLength(0)
  })
})
