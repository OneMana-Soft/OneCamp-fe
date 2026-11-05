import { readFileSync } from "node:fs"
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { pageTitle } from "@/lib/utils/pageTitle"

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))
const runBoardExport = vi.fn()
const saveBoardFile = vi.fn()
vi.mock("@/components/board/exportRun", () => ({
  runBoardExport: (...a: unknown[]) => runBoardExport(...a),
  saveBoardFile: (...a: unknown[]) => saveBoardFile(...a),
}))

import { EXPORT_NOT_RECORDED } from "@/lib/export/exportTell"
import { EXPORT_FAILED, EXPORT_REFUSED_TITLE, PICTURE_BUTTON, isSaveAsKey, isSaveKey, makesPicture, recordBoardExport, tabBoardName, useBoardExportTrail } from "./exportRecord"

const BOARD = "b0a4d000-0000-4000-8000-0000000000f5"
const PAGE = `/app/board/${BOARD}`
const flush = () => new Promise((r) => setTimeout(r, 0))
const TOO_MANY = "You've exported a lot in the last few minutes. Wait a few minutes and try again."

/** Excalidraw's image dialog's row: PNG, SVG, the clipboard's copy, each with a label inside. */
function imageDialogRow() {
  const row = document.createElement("div")
  row.className = "ImageExportModal__settings__buttons"
  for (const name of ["PNG", "SVG", "Copy to clipboard"]) {
    const b = document.createElement("button")
    b.className = `ExcButton ${PICTURE_BUTTON}`
    b.innerHTML = `<span>${name}</span>`
    row.append(b)
  }
  document.body.append(row)
  return Array.from(row.children) as HTMLButtonElement[]
}

/** An Excalidraw API with its drawing, its dialog state, its change listeners and its registered actions. */
function fakeApi(drawing: unknown[] = [{ id: "n1" }]) {
  let state: { openDialog: { name: string } | null } = { openDialog: null }
  let elements = drawing
  const listeners = new Set<(e: unknown, s: typeof state) => void>()
  const actions = new Map<string, { keyTest?: unknown; viewMode?: boolean; trackEvent?: unknown; perform: () => unknown }>()
  const api = {
    getAppState: () => state,
    getSceneElements: () => elements,
    onChange: (cb: (e: unknown, s: typeof state) => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    registerAction: (a: { name: string; perform: () => unknown }) => actions.set(a.name, a),
  }
  const dialog = (name: string | null) => {
    state = { openDialog: name ? { name } : null }
    for (const cb of listeners) cb(elements, state)
  }
  const draw = (next: unknown[]) => {
    elements = next
  }
  return { api: api as never, dialog, draw, actions, listeners }
}

const told = () => post.mock.calls.map((c) => (c[1] as { format: string }).format)

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} })
  toast.mockReset()
  runBoardExport.mockReset().mockResolvedValue(true)
  saveBoardFile.mockReset().mockResolvedValue("Saved")
})
afterEach(() => {
  // Each test's board leaves the page, its listeners with it.
  cleanup()
  document.body.innerHTML = ""
  document.title = ""
  window.history.replaceState(null, "", "/")
})

describe("telling the admin log of a board's export", () => {
  it("posts the board and the format with no toast of axios's own, and a refused tell throws why", async () => {
    await recordBoardExport(BOARD, "csv")
    expect(post).toHaveBeenCalledWith("/board/recordExport", { board_uuid: BOARD, format: "csv" }, { suppressErrorToast: true })
    // Too many exports in a few minutes: the server's words (V-363).
    post.mockRejectedValueOnce({ response: { status: 429, data: { msg: TOO_MANY } } })
    await expect(recordBoardExport(BOARD, "pdf")).rejects.toThrow(TOO_MANY)
    // No answer: the export couldn't be recorded, so none is made.
    post.mockRejectedValueOnce(new Error("offline"))
    await expect(recordBoardExport(BOARD, "pdf")).rejects.toThrow(EXPORT_NOT_RECORDED)
    // No board, nothing to tell.
    await recordBoardExport("", "file")
    expect(post).toHaveBeenCalledTimes(3)
  })

  it("reads a picture from the image dialog's PNG or SVG, never its clipboard copy or anything else", () => {
    const [png, svg, copy] = imageDialogRow()
    expect(makesPicture(png)).toBe(true)
    expect(makesPicture(svg.firstElementChild)).toBe(true)
    expect(makesPicture(copy)).toBe(false)
    expect(makesPicture(document.body)).toBe(false)
    expect(makesPicture(null)).toBe(false)
  })

  it("reads Ctrl or Cmd+S as a save, never with Shift or Alt, or another letter", () => {
    const key = (key: string, o: KeyboardEventInit = {}) => isSaveKey(new KeyboardEvent("keydown", { key, ...o }))
    expect(key("s", { ctrlKey: true })).toBe(true)
    expect(key("s", { metaKey: true })).toBe(true)
    expect(key("S", { ctrlKey: true })).toBe(true)
    expect(key("S", { ctrlKey: true, shiftKey: true })).toBe(false)
    expect(key("s", { ctrlKey: true, altKey: true })).toBe(false)
    expect(key("s")).toBe(false)
    expect(key("d", { ctrlKey: true })).toBe(false)
  })

  it("reads Ctrl or Cmd+Shift+S, Excalidraw's save to disk, apart from the save, so no press is both", () => {
    const key = (key: string, o: KeyboardEventInit = {}) => isSaveAsKey(new KeyboardEvent("keydown", { key, ...o }))
    expect(key("S", { ctrlKey: true, shiftKey: true })).toBe(true)
    expect(key("S", { metaKey: true, shiftKey: true })).toBe(true)
    expect(key("s", { ctrlKey: true })).toBe(false)
    expect(key("S", { shiftKey: true })).toBe(false)
    expect(key("S", { ctrlKey: true, shiftKey: true, altKey: true })).toBe(false)
    expect(key("D", { ctrlKey: true, shiftKey: true })).toBe(false)
  })
})

describe("the board's name, as its own page's tab gives it", () => {
  const tab = (boards: Record<string, string>, unread = 0, path = PAGE) => pageTitle(path, { boards }, unread)

  it("reads the name the tab gives the board, whatever is waiting and whatever the name holds", () => {
    expect(tabBoardName(BOARD, PAGE, tab({ [BOARD]: "Kickoff" }))).toBe("Kickoff")
    expect(tabBoardName(BOARD, PAGE, tab({ [BOARD]: "Kickoff" }, 3))).toBe("Kickoff")
    expect(tabBoardName(BOARD, PAGE, tab({ [BOARD]: "Kickoff" }, 120))).toBe("Kickoff")
    expect(tabBoardName(BOARD, PAGE, tab({ [BOARD]: "Q4 · plan (draft)" }, 2))).toBe("Q4 · plan (draft)")
  })

  it("knows none where the tab names only the section, or names another page", () => {
    // The sidebar lists a workspace's 8 newest boards; an older one's tab says "Boards".
    expect(tabBoardName(BOARD, PAGE, tab({}))).toBe("")
    expect(tabBoardName(BOARD, PAGE, tab({}, 4))).toBe("")
    // A call's stage: the tab is the call's.
    const call = "/app/meet/ch/c0ffee00-0000-4000-8000-0000000000cb"
    expect(tabBoardName(BOARD, call, pageTitle(call, { channels: { "c0ffee00-0000-4000-8000-0000000000cb": "launch" } }))).toBe("")
    // Another board's page.
    expect(tabBoardName(BOARD, "/app/board/other", tab({ other: "Retro" }, 0, "/app/board/other"))).toBe("")
  })

  it("reads the page's own address and tab when asked with none", () => {
    window.history.replaceState(null, "", PAGE)
    document.title = tab({ [BOARD]: "Kickoff" }, 1)
    expect(tabBoardName(BOARD)).toBe("Kickoff")
  })
})

describe("useBoardExportTrail", () => {
  it("tells a picture only while this board's image dialog is open, at its PNG or SVG", () => {
    const [png, svg, copy] = imageDialogRow()
    const { api, dialog, listeners } = fakeApi()
    const { unmount } = renderHook(() => useBoardExportTrail(api, BOARD))
    png.click()
    expect(told()).toEqual([])
    // Another dialog (Help) isn't the image dialog.
    dialog("help")
    png.click()
    expect(told()).toEqual([])
    dialog("imageExport")
    png.click()
    svg.click()
    copy.click()
    expect(told()).toEqual(["picture", "picture"])
    expect(post.mock.calls[0][1]).toEqual({ board_uuid: BOARD, format: "picture" })
    dialog(null)
    svg.click()
    expect(told()).toEqual(["picture", "picture"])
    // Gone from the page while its dialog is open: nothing heard after.
    dialog("imageExport")
    unmount()
    png.click()
    expect(told()).toEqual(["picture", "picture"])
    expect(listeners.size).toBe(0)
  })

  it("holds a picture's PNG or SVG until the log has its tell, then lets Excalidraw make it; a refusal makes none and says why", async () => {
    const [png] = imageDialogRow()
    const made = vi.fn()
    // Excalidraw's own handler on the button, behind ours (ours listens on the document as presses are captured).
    png.addEventListener("click", made)
    const { api, dialog } = fakeApi()
    renderHook(() => useBoardExportTrail(api, BOARD))
    dialog("imageExport")
    let answer: (v: unknown) => void = () => {}
    post.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    png.click()
    // Told, and held while the log answers.
    expect(told()).toEqual(["picture"])
    expect(made).not.toHaveBeenCalled()
    answer({ data: {} })
    await flush()
    // Answered: pressed again for Excalidraw, once, and that press isn't told twice.
    expect(made).toHaveBeenCalledTimes(1)
    expect(told()).toEqual(["picture"])
    // Too many exports in a few minutes: no picture, and the server's words.
    post.mockRejectedValueOnce({ response: { status: 429, data: { msg: TOO_MANY } } })
    png.click()
    await flush()
    expect(made).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: EXPORT_REFUSED_TITLE, description: TOO_MANY })
    // The next press is held and told again, as any is.
    png.click()
    await flush()
    expect(told()).toEqual(["picture", "picture", "picture"])
    expect(made).toHaveBeenCalledTimes(2)
  })

  it("tells nothing of an empty board's picture, which Excalidraw refuses to save, judged as the dialog opened", () => {
    const [png] = imageDialogRow()
    const { api, dialog, draw } = fakeApi([])
    renderHook(() => useBoardExportTrail(api, BOARD))
    dialog("imageExport")
    // Drawn on after the dialog opened: the dialog still exports what it opened with, nothing.
    draw([{ id: "n1" }])
    png.click()
    expect(told()).toEqual([])
    dialog(null)
    dialog("imageExport")
    // Rubbed out after it opened: the dialog still exports the drawing it opened with.
    draw([])
    png.click()
    expect(told()).toEqual(["picture"])
  })

  it("tells the board the canvas shows when the picture is saved", () => {
    const [png] = imageDialogRow()
    const { api, dialog } = fakeApi()
    const { rerender } = renderHook(({ board }) => useBoardExportTrail(api, board), { initialProps: { board: BOARD } })
    rerender({ board: "b2" })
    dialog("imageExport")
    png.click()
    expect(post.mock.calls[0][1]).toEqual({ board_uuid: "b2", format: "picture" })
  })

  it("makes Excalidraw's saves the Export dialog's board file, told, named as the board's page's tab names it", async () => {
    window.history.replaceState(null, "", PAGE)
    document.title = pageTitle(PAGE, { boards: { [BOARD]: "Kickoff review" } }, 2)
    const { api, actions } = fakeApi()
    renderHook(() => useBoardExportTrail(api, BOARD))
    const toActive = actions.get("saveToActiveFile")!
    const toDisk = actions.get("saveFileToDisk")!
    expect(toActive.keyTest).toBe(isSaveKey)
    // Its save to disk keeps its own key, Ctrl or Cmd+Shift+S, for the same told save.
    const press = (o: KeyboardEventInit) => (toDisk.keyTest as ((e: KeyboardEvent) => boolean) | undefined)?.(new KeyboardEvent("keydown", { key: "S", ...o }))
    expect(press({ ctrlKey: true, shiftKey: true })).toBe(true)
    expect(press({ ctrlKey: true })).toBe(false)
    expect([toActive.viewMode, toActive.trackEvent, toDisk.viewMode]).toEqual([true, false, true])
    // Excalidraw's state stays as it is: the action changes nothing on the scene.
    expect(toActive.perform()).toBe(false)
    await flush()
    expect(runBoardExport).toHaveBeenCalledTimes(1)
    const run = runBoardExport.mock.calls[0][0] as { format: string; boardId: string; make: () => Promise<string>; toast: (t: unknown) => void }
    expect(run).toMatchObject({ format: "file", boardId: BOARD })
    await run.make()
    expect(saveBoardFile).toHaveBeenCalledWith(api, "Kickoff review")
    // It says what it saved in the app's own toasts.
    run.toast({ title: "Saved as Kickoff review.excalidraw" })
    expect(toast).toHaveBeenCalledWith({ title: "Saved as Kickoff review.excalidraw" })
    // Its code not reaching the browser says so, as a failed export does.
    runBoardExport.mockRejectedValueOnce(new Error("chunk"))
    toDisk.perform()
    await flush()
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", ...EXPORT_FAILED })
  })

  it("names the file for no board where the tab knows none, as on a call's stage", async () => {
    window.history.replaceState(null, "", "/app/meet/ch/c0ffee00-0000-4000-8000-0000000000cb")
    document.title = "#launch · OneCamp"
    const { api, actions } = fakeApi()
    renderHook(() => useBoardExportTrail(api, BOARD))
    actions.get("saveToActiveFile")!.perform()
    await flush()
    await (runBoardExport.mock.calls[0][0] as { make: () => Promise<string> }).make()
    expect(saveBoardFile).toHaveBeenCalledWith(api, "")
  })
})

describe("what Ctrl or Cmd+S loads", () => {
  // This trail rides in Excalidraw's lazy chunk wherever a board's canvas draws, a call's stage and a guest's
  // viewer included. Loading the Export dialog's module from it would carry the dialog's chunks to each of them.
  it("is the module both export paths share, never the Export dialog's own", () => {
    const imports = (file: string) => [...readFileSync(file, "utf8").matchAll(/(?:\bfrom\s+|\bimport\(\s*)["']([^"']+)["']/g)].map((m) => m[1])
    expect(imports("components/board/exportRecord.ts")).toContain("@/components/board/exportRun")
    for (const file of ["components/board/exportRecord.ts", "components/board/exportRun.ts"]) {
      expect(imports(file).filter((spec) => /boardExport$/.test(spec))).toEqual([])
    }
  })

  it("is never a guest's: the guest's viewer draws the plain Excalidraw, which tells nothing", () => {
    // A guest's export isn't a member's, and the trail's module stays out of the guest's chunks.
    const viewer = readFileSync("components/guest/GuestBoardViewer.tsx", "utf8")
    expect(viewer).toContain('(await import("@/components/board/boardExcalidraw")).default')
    expect(viewer).not.toMatch(/MemberExcalidraw|useBoardExportTrail|exportRecord|exportRun/)
  })
})

describe("the Excalidraw this app installs", () => {
  // Its readable build: an upgrade that moves any of these fails here, before a board's export goes untold.
  const app = readFileSync("node_modules/@excalidraw/excalidraw/dist/dev/index.js", "utf8")

  it("draws the image dialog's buttons PNG, SVG and the clipboard's copy, in that order, each with our class on its button", () => {
    const row = app.slice(app.indexOf('className: "ImageExportModal__settings__buttons"'))
    const at = (what: string) => row.indexOf(`label: t("imageExportDialog.title.${what}")`)
    expect(at("exportToPng")).toBeGreaterThan(0)
    expect(at("exportToPng")).toBeLessThan(at("exportToSvg"))
    expect(at("exportToSvg")).toBeLessThan(at("copyPngToClipboard"))
    expect(row.slice(0, at("copyPngToClipboard")).split(`className: "${PICTURE_BUTTON}"`).length - 1).toBe(3)
    expect(app).toMatch(/"button",\s*\{\s*className: clsx\d*\(\s*"ExcButton",[^)]*\bclassName\s*\)/)
  })

  it("opens that dialog by its state, and tells every change to an API listener", () => {
    expect(app).toContain('setAppState({ openDialog: { name: "imageExport" } })')
    expect(app).toContain("this.onChangeEmitter.trigger(elements, this.state, this.files);")
  })

  it("exports the drawing the image dialog opened with, and refuses an empty one", () => {
    expect(app).toMatch(/appStateSnapshot: cloneJSON\(appState\),\s*elementsSnapshot: cloneJSON\(elements\)/)
    expect(app).toMatch(/if \(elements\.length === 0\) \{\s*throw new Error\(t\("alerts\.cannotExportEmptyCanvas"\)\);/)
  })

  it("keeps its actions by name, which keys look up, so ours replace its saves", () => {
    expect(app).toMatch(/registerAction\(action\) \{\s*this\.actions\[action\.name\] = action;/)
    expect(app).toContain("const data = Object.values(this.actions).sort(")
    expect(app).toContain('name: "saveToActiveFile",')
    expect(app).toContain('name: "saveFileToDisk",')
  })
})
