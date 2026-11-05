import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { afterEach, describe, expect, it, vi } from "vitest"
import { privateViews } from "./privateMode"
import { outwardNow, outwardScene, outwardTexts } from "./sceneOut"

// The board as it may leave this tab (miro-25): every path but the frame's own sync that sends a board's words
// anywhere reads the scene through lib/board/sceneOut, so private mode's held words never go, and nothing goes
// while a round runs and private mode's code is still coming.

type El = { id: string; type: string; text?: string; isDeleted?: boolean; customData?: Record<string, unknown> }
const text = (id: string, words: string, more: Partial<El> = {}): El => ({ id, type: "text", text: words, ...more })
const sceneApi = (scene: El[]) => ({ getSceneElements: () => scene.filter((e) => !e.isDeleted) })
const veiled = (e: El): El => (e.id.startsWith("held") ? { ...e, text: "", customData: { privateBy: "u-sam" } } : e)
const view = (holds: boolean, outward: ((s: readonly El[]) => El[]) | null) => ({
  holds: () => holds,
  handle: { current: outward ? { outward } : null },
})

afterEach(() => vi.useRealTimers())

describe("the board as it may leave this tab", () => {
  it("is the scene as it is on a canvas private mode never came to", () => {
    const api = sceneApi([text("a", "Ship it")])
    expect(outwardNow(api)).toEqual([text("a", "Ship it")])
  })

  it("is the handle's outward view while private mode runs: a held note goes veiled", () => {
    const api = sceneApi([text("a", "Ship it"), text("held-1", "My secret")])
    privateViews.set(api, view(false, (s) => s.map(veiled)))
    expect(outwardNow<El>(api)?.map((e) => e.text)).toEqual(["Ship it", ""])
  })

  it("is nothing while a round runs and private mode's code is still coming; then the outward view, read afresh", async () => {
    vi.useFakeTimers()
    const scene = [text("held-1", "My secret")]
    const api = sceneApi(scene)
    const gate = { holding: true, outward: null as ((s: readonly El[]) => El[]) | null }
    privateViews.set(api, { holds: () => gate.holding, handle: { get current() { return gate.outward ? { outward: gate.outward } : null } } })
    expect(outwardNow(api)).toBeNull()
    let sent: El[] | null = null
    void outwardScene<El>(api).then((s) => (sent = s))
    await vi.advanceTimersByTimeAsync(500)
    expect(sent).toBeNull()
    scene.push(text("held-2", "Another"))
    gate.holding = false
    gate.outward = (s) => s.map(veiled)
    await vi.advanceTimersByTimeAsync(150)
    expect(sent).toEqual([veiled(text("held-1", "My secret")), veiled(text("held-2", "Another"))])
  })

  it("gives up after its wait, so its caller says so and sends nothing", async () => {
    vi.useFakeTimers()
    const api = sceneApi([text("held-1", "My secret")])
    privateViews.set(api, view(true, null))
    const out = outwardScene(api, 1_000)
    const caught = out.catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(1_200)
    expect(await caught).toBeInstanceOf(Error)
  })

  it("gives AI each text's words once, as they may leave: none deleted, none blank, at most `max`", async () => {
    const api = sceneApi([
      text("a", "  Ship it  "),
      text("held-1", "My secret"),
      text("gone", "Old", { isDeleted: true }),
      { id: "box", type: "rectangle" },
      text("b", "Hire"),
      text("c", "Plan"),
    ])
    privateViews.set(api, view(false, (s) => s.map(veiled)))
    expect(await outwardTexts(api, 120)).toEqual([
      { id: "a", text: "Ship it" },
      { id: "b", text: "Hire" },
      { id: "c", text: "Plan" },
    ])
    expect(await outwardTexts(api, 2)).toEqual([
      { id: "a", text: "Ship it" },
      { id: "b", text: "Hire" },
    ])
  })
})

// The guard: a board file that reads the scene and sends anything (a request, an upload, the shared document) is
// named here with how its scene goes. "sceneOut" files import lib/board/sceneOut; the canvas writes through the
// frame's writer and sends its thumbnail through the handle's outward view; the rest say why no scene goes.
const SENDS = /\b(makeRequest|axiosInstance\s*\.\s*(post|put|patch)|authedStreamFetch|publishTemplate|uploadBoardBlob|exportToBlob|exportToSvg|exportToCanvas|storeWithMakers|fetch)\s*[(<]/
const READS = /\bgetSceneElements(IncludingDeleted)?\s*\(|"@\/lib\/board\/sceneOut"/
const HOW: Record<string, string> = {
  "components/board/boardTools.tsx": "sceneOut", // Make tasks: a note held in private mode stays out
  "components/board/saveBoardTemplate.tsx": "sceneOut", // a saved template
  "components/board/boardCanvas.tsx": "writer", // the frame's sync writes through the writer; the thumbnail sends the outward view
  "components/board/privateNotesHost.tsx": "none: it writes the author's own notes only at the reveal, after the round",
  "components/board/exportRecord.ts": "none: it records an export's format; the file itself is saved on this device",
  "components/board/boardExport.tsx": "none: it saves the board as a file on this device, as its author sees it",
}
const HOW_CHECK: Record<string, RegExp> = {
  sceneOut: /from "@\/lib\/board\/sceneOut"|import\("@\/lib\/board\/sceneOut"\)/,
  writer: /\.writer\(/,
}

describe("every board path that sends the scene", () => {
  const files = execFileSync("git", ["ls-files", "components/board", "lib/board", "app/app/board"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|\.spec\./.test(f))
  const sending = files.filter((f) => {
    const src = readFileSync(f, "utf8")
    return READS.test(src) && SENDS.test(src)
  })

  it("is named with how its scene goes, so private mode's held words never leave the tab", () => {
    expect(sending.length).toBeGreaterThan(3)
    for (const f of sending) expect(HOW[f], `${f} reads the scene and sends: read it through lib/board/sceneOut, or name it here with why no scene goes`).toBeDefined()
  })

  it("goes the way it says", () => {
    for (const [f, how] of Object.entries(HOW)) {
      expect(sending, `${f} no longer reads the scene and sends: take it off the list`).toContain(f)
      const check = HOW_CHECK[how]
      if (check) expect(readFileSync(f, "utf8"), `${f} should send its scene through ${how}`).toMatch(check)
      else expect(how).toMatch(/^none: \w/)
    }
    // The canvas's thumbnail too.
    expect(readFileSync("components/board/boardCanvas.tsx", "utf8")).toMatch(/exportToBlob\(\{\s*elements: privateRef\.current\?\.outward\(/)
  })
})
