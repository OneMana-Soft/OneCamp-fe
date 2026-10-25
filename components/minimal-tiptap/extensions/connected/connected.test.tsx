import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import { EditorContent, type Editor } from "@tiptap/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"

// Docs C1 in a real doc editor: "/page", page blocks, "[[", ⌘⇧Enter, the
// to-do's tick and the "@" list's dates and people. The API is answered here
// by path (posted is what was sent); the broker and the router are stood in for.

const DOC = "0d0c0000-0000-4000-8000-000000000001"
const NEW_PAGE = "0d0c0000-0000-4000-8000-000000000002"
const OTHER_PAGE = "0d0c0000-0000-4000-8000-000000000003"
const PROJECT = "9e0c0000-0000-4000-8000-000000000004"
const TASK = "7a5c0000-0000-4000-8000-000000000005"

type Answer = { kind: string; id: string; access: string; data?: Record<string, unknown>; topic?: string }
const entities = new Map<string, Answer>()
const posted: Array<{ url: string; body: Record<string, unknown> }> = []
let refuseCheck = false
let failReads = false
let failSelf = false
let failProjects = false
const users = [
  { user_uuid: "u-sam", uid: "0x1", user_full_name: "Sam Rivera", user_name: "Sam", is_bot: false },
  { user_uuid: "u-maya", uid: "0x2", user_full_name: "Maya Chen", user_name: "Maya", is_bot: false },
  { user_uuid: "u-ravi", uid: "0x3", user_full_name: "Ravi Iyer", user_name: "Ravi", is_bot: false },
]

let board: Record<string, unknown> = {}
const gets: string[] = []
let laterItems: Array<{ id: string }> = []
// What POST /doc/mentionAccess answers: the server's word on who can't open the doc and whether the writer may invite them.
let mentionAnswer: { can_share: boolean; cant_open: string[] } | "refused" = { can_share: true, cant_open: ["u-maya"] }
const topics = new Map<string, (raw: string) => void>()
vi.mock("@/lib/axiosInstance", () => ({
  OWN_ERRORS: { suppressErrorToast: true },
  default: {
    get: vi.fn(async (url: string) => {
      gets.push(url)
      if (url.startsWith("/later?state=open")) return { status: 200, data: { data: { items: laterItems } } }
      if (url.includes("/user/allUsers")) return { status: 200, data: { users } }
      if (url === "/user/profile" && failSelf) throw Object.assign(new Error("503"), { response: { status: 503, data: {} } })
      if (url.startsWith("/user/userProjectList") && failProjects) throw Object.assign(new Error("503"), { response: { status: 503, data: {} } })
      if (url.startsWith(`/project/taskListForKanban/${PROJECT}`)) return { status: 200, data: { data: board } }
      return { status: 200, data: {} }
    }),
    post: vi.fn(async (url: string, body: Record<string, unknown>) => {
      posted.push({ url, body })
      if (url === "/entities") {
        if (failReads) throw Object.assign(new Error("503"), { response: { status: 503, data: {} } })
        const refs = body.refs as Array<{ kind: string; id: string }>
        return { data: { data: refs.map((r) => entities.get(`${r.kind}:${r.id}`) ?? { ...r, access: "none" }) } }
      }
      if (url === "/doc/todoTask") return { data: { data: { task_uuid: TASK } } }
      if (url === "/doc/todoTask/check" && refuseCheck) throw Object.assign(new Error("403"), { response: { data: { msg: "Only the project's admins can change this task. Ask one of them to change it." } } })
      if (url.startsWith("/search/unifiedSearch")) return { data: { data: { page: [{ type: "doc", doc: { doc_uuid: OTHER_PAGE, doc_title: "Launch notes" } }] } } }
      if (url === "/doc/mentionAccess") {
        if (mentionAnswer === "refused") throw Object.assign(new Error("404"), { response: { status: 404, data: { msg: "Doc not found" } } })
        return { data: { data: mentionAnswer } }
      }
      if (url === "/later/save") return { data: { data: { id: "later-1", remind_at: body.remind_at } } }
      return { data: {} }
    }),
  },
}))
vi.mock("@/services/docGraphService", () => ({ createDoc: vi.fn(async () => ({ doc_uuid: NEW_PAGE, doc_title: "" })), refreshDocGraph: vi.fn() }))
vi.mock("@/hooks/useMqttTopic", () => ({
  useMqttTopic: ({ topic, onMessage }: { topic: string; onMessage?: (raw: string) => void }) => {
    if (topic && onMessage) topics.set(topic, onMessage)
  },
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => `/app/doc/${DOC}` }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined, useBotKind: () => undefined }))
const prefetched: string[] = []
vi.mock("@/lib/docPrefetch", () => ({ prefetchDoc: (id: string) => void prefetched.push(id) }))
const toasts: string[] = []
vi.mock("@/hooks/use-toast", async (original) => ({
  ...(await original<typeof import("@/hooks/use-toast")>()),
  toast: (t: { title?: string }) => {
    toasts.push(String(t.title))
    return { id: String(toasts.length), dismiss: () => undefined, update: () => undefined }
  },
}))

import store from "@/store/store"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { actionById, blockById } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { useDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { useDocEditor } from "@/components/docEditor/useDocEditor"
import { offlineProvider } from "@/components/docEditor/docTestKit"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"
import { resetLiveEntities } from "@/lib/liveEntity/store"
import { GuestReaderContext } from "@/components/minimal-tiptap/guestReader"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { mentionSuggestionOptions } from "../mention-list/mentionList"
import { forgetMentionAccess } from "../mention-list/mentionInDoc"
import { PICK_PAGE, PICK_PROJECT, peekPick, pickProject, type Picked } from "./pick"
import { countMention, mentionCounts } from "@/lib/mentionedOften"
import { MqttMessageType } from "@/services/mqttService"
import ProjectPickerDialog from "./ProjectPickerDialog"
import { pinTestClock } from "@/lib/testing/testClock"
import { bindAppMutate } from "@/lib/swrMutate"
import { docInfoKey } from "@/lib/docCache"
import type { Cache, ScopedMutator } from "swr"

pinTestClock()

beforeAll(() => loadBlocks("doc", { ai: true }), 30_000)
beforeAll(() => {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
    Range.prototype.getBoundingClientRect = () => new DOMRect()
  }
})

const providers: HocuspocusProvider[] = []
beforeEach(() => {
  entities.clear()
  posted.length = 0
  gets.length = 0
  laterItems = []
  mentionAnswer = { can_share: true, cant_open: ["u-maya"] }
  forgetMentionAccess()
  topics.clear()
  toasts.length = 0
  prefetched.length = 0
  refuseCheck = false
  failReads = false
  failSelf = false
  failProjects = false
  board = {}
  push.mockReset()
  resetLiveEntities()
  localStorage.removeItem("onecamp-mentioned-often")
  entities.set(`doc:${DOC}`, { kind: "doc", id: DOC, access: "ok", data: { title: "Plan", space_kind: "project", space_id: PROJECT } })
  entities.set(`project:${PROJECT}`, { kind: "project", id: PROJECT, access: "ok", data: { name: "Launch", can_edit: true } })
})
afterEach(() => {
  cleanup()
  while (providers.length) providers.pop()?.destroy()
})

const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

/**
 * A doc editor as the doc page makes it: live, with the doc's bus; as a
 * guest's page draws it with guest; with freshReads, no answer an earlier
 * test left in the request cache.
 */
async function docEditor(html = "<p></p>", { guest = false, freshReads = false } = {}) {
  const provider = offlineProvider()
  providers.push(provider)
  let editor: Editor | null = null
  function Doc() {
    const e = useDocEditor({ collaboration: { enabled: true, documentId: DOC, username: "Sam Rivera", userId: "u-sam" }, provider })
    useDocCommandBus(DOC, e as unknown as Editor | null)
    editor = e as unknown as Editor | null
    return e ? <EditorContent editor={e} /> : null
  }
  const doc = (
    <GuestReaderContext.Provider value={guest}>
      <Doc />
    </GuestReaderContext.Provider>
  )
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <TooltipProvider>{freshReads ? <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{doc}</SWRConfig> : doc}</TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
  )
  await settle()
  await act(async () => {
    editor!.commands.setContent(html)
    editor!.commands.focus("end")
  })
  await settle()
  return editor!
}

function press(editor: Editor, combo: string) {
  const parts = combo.split(/-(?!$)/)
  const key = parts.pop()!
  const event = new KeyboardEvent("keydown", { key, keyCode: key === "Enter" ? 13 : key.toUpperCase().charCodeAt(0), ctrlKey: parts.includes("Mod"), shiftKey: parts.includes("Shift"), bubbles: true, cancelable: true })
  act(() => void editor.view.dom.dispatchEvent(event))
  return event
}

const json = (editor: Editor) => JSON.stringify(editor.getJSON())
const todo = (attrs: string, inner: string) => `<ul data-type="taskList"><li data-type="taskItem" ${attrs}>${inner}</li></ul>`

describe("pages in a doc", () => {
  it("/page makes a page under this one, puts its block here, and opens it to name it", async () => {
    const editor = await docEditor("<p>/page</p>")
    const page = blockById("connectedSlash")!.slash!.find((s) => s.id === "page")!
    await act(async () => page.run(editor, { from: 1, to: 6 }))
    await vi.waitFor(() => expect(editor.getJSON().content?.find((n) => n.type === "subpage")?.attrs?.docId).toBe(NEW_PAGE), { timeout: 3000 })
    const { createDoc } = await import("@/services/docGraphService")
    // Private: nothing here says what this doc is (see below).
    expect(createDoc).toHaveBeenCalledWith({ parent_uuid: DOC, doc_private: true })
    // Opened once its block is drawn: its title is ready to type.
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/app/doc/${NEW_PAGE}?new=1`), { timeout: 3000 })
  })

  // Review, 16 Oct 2026 (P1): "/page" and "[["'s New page asked for a
  // subpage with parent_uuid alone. A server without nested pages (v2.72)
  // reads only doc_title and doc_private, and made it at the top, open to the
  // whole workspace, though this doc was private. Each is sent as private as
  // this doc, as its page knows it (its info, in the app's cache), and as
  // private when nothing says.
  describe("a page made in this doc, by / or [[", () => {
    const cached = new Map<string, { data?: unknown }>()
    beforeEach(() => bindAppMutate(vi.fn() as unknown as ScopedMutator, cached as unknown as Cache))
    afterEach(() => {
      bindAppMutate(null)
      cached.clear()
    })
    const thisDocIs = (priv: boolean) => cached.set(docInfoKey(DOC), { data: { msg: "ok", data: { doc_uuid: DOC, doc_private: priv } } })

    it("is as private as this doc: /page", async () => {
      const { createDoc } = await import("@/services/docGraphService")
      for (const priv of [false, true]) {
        thisDocIs(priv)
        vi.mocked(createDoc).mockClear()
        const editor = await docEditor("<p>/page</p>")
        const page = blockById("connectedSlash")!.slash!.find((s) => s.id === "page")!
        await act(async () => page.run(editor, { from: 1, to: 6 }))
        await vi.waitFor(() => expect(createDoc).toHaveBeenCalledWith({ parent_uuid: DOC, doc_private: priv }), { timeout: 3000 })
        cleanup()
      }
    })

    it("is as private as this doc: [['s New page, named as typed", async () => {
      const { createDoc } = await import("@/services/docGraphService")
      for (const priv of [false, true]) {
        thisDocIs(priv)
        vi.mocked(createDoc).mockClear()
        const editor = await docEditor("<p></p>")
        await act(async () => {
          for (const ch of "[[Launch") {
            const { from, to } = editor.state.selection
            const insert = () => editor.state.tr.insertText(ch, from, to)
            if (!editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))) editor.view.dispatch(insert())
          }
        })
        await vi.waitFor(() => expect(document.querySelector("[data-page-link-list]")?.textContent).toContain("New page"), { timeout: 3000 })
        // The pages found, then New page.
        press(editor, "ArrowDown")
        press(editor, "Enter")
        await vi.waitFor(() => expect(createDoc).toHaveBeenCalledWith({ doc_title: "Launch", parent_uuid: DOC, doc_private: priv }), { timeout: 3000 })
        cleanup()
      }
    })
  })

  it("shows a page's title as it is now, and never the title of one the reader can't open", async () => {
    entities.set(`doc:${NEW_PAGE}`, { kind: "doc", id: NEW_PAGE, access: "ok", data: { title: "Launch plan, v2", parent_id: DOC } })
    await docEditor(`<div data-type="subpage" data-doc-id="${NEW_PAGE}" data-title="Launch plan"></div><div data-type="subpage" data-doc-id="${OTHER_PAGE}" data-title="Salaries"></div>`)
    expect(await screen.findByText("Launch plan, v2")).toBeInTheDocument()
    expect(await screen.findByText("No access")).toBeInTheDocument()
    expect(screen.queryByText("Salaries")).toBeNull()
  })

  it("fetches a page ahead when the keyboard reaches its block or a press starts, as the sidebar's links do", async () => {
    entities.set(`doc:${NEW_PAGE}`, { kind: "doc", id: NEW_PAGE, access: "ok", data: { title: "Launch plan, v2", parent_id: DOC } })
    await docEditor(`<div data-type="subpage" data-doc-id="${NEW_PAGE}"></div>`)
    const block = await vi.waitFor(() => {
      const b = document.querySelector<HTMLElement>("[data-subpage-open][role=link]")
      expect(b).toBeTruthy()
      return b!
    }, { timeout: 3000 })
    fireEvent.focus(block)
    await vi.waitFor(() => expect(prefetched).toEqual([NEW_PAGE]), { timeout: 3000 })
    fireEvent.pointerDown(block)
    await vi.waitFor(() => expect(prefetched).toEqual([NEW_PAGE, NEW_PAGE]), { timeout: 3000 })
  })

  it("[[ links a page with the + menu's chip, which makes it a backlink", async () => {
    const editor = await docEditor("<p></p>")
    await act(async () => {
      for (const ch of "[[Launch") {
        const { from, to } = editor.state.selection
        const insert = () => editor.state.tr.insertText(ch, from, to)
        if (!editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))) editor.view.dispatch(insert())
      }
    })
    await vi.waitFor(() => expect(document.querySelector("[data-page-link-list]")?.textContent).toContain("Launch notes"), { timeout: 3000 })
    press(editor, "Enter")
    // Its title is read live, as each reader may see it: the doc keeps only that it is a doc.
    await vi.waitFor(() => expect(json(editor)).toContain(`"id":"doc:${OTHER_PAGE}","label":"Doc","mentionSuggestionChar":"+"`), { timeout: 3000 })
    expect(json(editor)).not.toContain("Launch notes")
  })

  it("the + menu in a doc keeps a page's id, never its title", async () => {
    const editor = await docEditor("<p></p>")
    await type(editor, "+Laun")
    await vi.waitFor(() => expect(document.querySelector("[data-reference-list]")?.textContent).toContain("Launch notes"), { timeout: 3000 })
    press(editor, "Enter")
    await vi.waitFor(() => expect(json(editor)).toContain(`"id":"doc:${OTHER_PAGE}","label":"Doc"`), { timeout: 3000 })
    expect(json(editor)).not.toContain("Launch notes")
  })

  it("/link to page keeps the page's id, never its title", async () => {
    const editor = await docEditor("<p>/link</p>")
    busFor(editor)!.on("openDialog", ({ id }: { id: string }) => {
      if (id === PICK_PAGE) peekPick(PICK_PAGE)?.answer({ id: OTHER_PAGE, name: "Salaries" })
    })
    const link = blockById("connectedSlash")!.slash!.find((s) => s.id === "linkToPage")!
    await act(async () => link.run(editor, { from: 1, to: 6 }))
    await vi.waitFor(() => expect(editor.getJSON().content?.find((n) => n.type === "subpage")?.attrs?.docId).toBe(OTHER_PAGE), { timeout: 3000 })
    expect(json(editor)).not.toContain("Salaries")
  })

  it("tells a guest only that a page or a chip is there, never a title an older client kept", async () => {
    await docEditor(
      `<div data-type="subpage" data-doc-id="${OTHER_PAGE}" data-title="Salaries"></div><p><span data-type="entityMention" data-id="doc:${OTHER_PAGE}" data-label="Salaries 2027"></span></p>`,
      { guest: true },
    )
    expect(await screen.findByText("Page")).toBeInTheDocument()
    expect(screen.getByText("Doc")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("Salaries")
    expect(posted.some((p) => p.url === "/entities")).toBe(false)
  })
})

describe("a to-do that becomes a task", () => {
  it("⌘⇧Enter makes a task in the doc's project, and the line becomes the task's live chip", async () => {
    entities.set(`task:${TASK}`, { kind: "task", id: TASK, access: "ok", data: { name: "Write the launch post", status: "todo", status_name: "To do", done: false, can_edit: true } })
    const editor = await docEditor(todo('data-checked="false"', "<p>Write the launch post</p>"))
    act(() => void editor.commands.setTextSelection(4))
    expect(press(editor, "Mod-Shift-Enter").defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(json(editor)).toContain(`"taskId":"${TASK}"`), { timeout: 3000 })
    expect(posted.find((p) => p.url === "/doc/todoTask")?.body).toEqual({ doc_uuid: DOC, project_uuid: PROJECT, title: "Write the launch post" })
    expect(json(editor)).toContain(`"id":"task:${TASK}"`)
    expect(toasts).toContain("Made the task in Launch")
  })

  it("makes one task of a to-do pressed twice before the first is made", async () => {
    const editor = await docEditor(todo('data-checked="false"', "<p>Write the launch post</p>"))
    act(() => void editor.commands.setTextSelection(4))
    press(editor, "Mod-Shift-Enter")
    press(editor, "Mod-Shift-Enter")
    await vi.waitFor(() => expect(json(editor)).toContain(`"taskId":"${TASK}"`), { timeout: 3000 })
    await settle(60)
    expect(posted.filter((p) => p.url === "/doc/todoTask")).toHaveLength(1)
    expect(toasts.filter((t) => t === "Made the task in Launch")).toHaveLength(1)
  })

  it("draws a to-do once when something restyles its box: its chip, and a card open on it, stay", async () => {
    entities.set(`task:${TASK}`, { kind: "task", id: TASK, access: "ok", data: { name: "Ship", status: "todo", status_name: "To do", done: false, can_edit: true } })
    const editor = await docEditor(todo(`data-checked="false" data-task-id="${TASK}"`, `<p><span data-type="entityMention" data-id="task:${TASK}" data-label="Ship"></span></p>`))
    const chip = await vi.waitFor(() => {
      const c = editor.view.dom.querySelector<HTMLElement>("li [data-entity-chip]")
      expect(c?.textContent).toContain("Ship")
      return c!
    }, { timeout: 3000 })
    const item = chip.closest("li")!
    // A screenshot tool or a browser extension sets a style on the box and its label.
    act(() => {
      item.querySelector("label")!.style.outline = "2px solid red"
      item.querySelector("input")!.setAttribute("data-shot", "1")
      ;(editor.view as unknown as { domObserver: { flush: () => void } }).domObserver.flush()
    })
    await settle(30)
    expect(item.isConnected).toBe(true)
    expect(chip.isConnected).toBe(true)
    expect(json(editor)).toContain('"checked":false')
  })

  it("makes the to-do the block menu is on a task, and offers it no more once it is one", async () => {
    const editor = await docEditor(todo('data-checked="false"', "<p>Write the launch post</p>"))
    const action = actionById("connected.todoToTask", { ai: true })!
    const ctx = { docId: DOC, editor, canEdit: true, bus: busFor(editor)!, state: { range: { from: 1, to: 24 } } } as unknown as ActionContext
    expect(action.isVisible?.(ctx)).toBe(true)
    await act(async () => void (await action.run(ctx)))
    await vi.waitFor(() => expect(json(editor)).toContain(`"taskId":"${TASK}"`), { timeout: 3000 })
    expect(posted.find((p) => p.url === "/doc/todoTask")?.body).toEqual({ doc_uuid: DOC, project_uuid: PROJECT, title: "Write the launch post" })
    expect(action.isVisible?.(ctx)).toBe(false)
    // Nor to someone who can't change the doc.
    expect(action.isVisible?.({ ...ctx, canEdit: false })).toBe(false)
  })

  it("asks nothing of an empty to-do, and says why", async () => {
    const editor = await docEditor(todo('data-checked="false"', "<p></p>"))
    act(() => void editor.commands.setTextSelection(3))
    press(editor, "Mod-Shift-Enter")
    await settle(60)
    expect(posted.some((p) => p.url === "/doc/todoTask")).toBe(false)
    expect(toasts).toContain("Write the to-do first, then make it a task.")
  })

  it("sends a tick to the task, and takes back one the task refuses", async () => {
    entities.set(`task:${TASK}`, { kind: "task", id: TASK, access: "ok", data: { name: "Ship", status: "todo", status_name: "To do", done: false, can_edit: true } })
    const editor = await docEditor(todo(`data-checked="false" data-task-id="${TASK}"`, `<p><span data-type="entityMention" data-id="task:${TASK}" data-label="Ship"></span></p>`))
    await settle(60)
    act(() => void editor.commands.setTextSelection(3))
    press(editor, "Mod-Enter")
    await settle(60)
    expect(posted.find((p) => p.url === "/doc/todoTask/check")?.body).toEqual({ doc_uuid: DOC, task_uuid: TASK, done: true })
    expect(json(editor)).toContain('"checked":true')

    refuseCheck = true
    press(editor, "Mod-Enter")
    await settle(60)
    expect(posted.filter((p) => p.url === "/doc/todoTask/check")).toHaveLength(2)
    // The untick the task refused is put back: the box says what the task does.
    expect(json(editor)).toContain('"checked":true')
    expect(toasts).toContain("Only the project's admins can change this task. Ask one of them to change it.")
  })

  it("refuses a tick on a task the reader can't change before it lands", async () => {
    entities.set(`task:${TASK}`, { kind: "task", id: TASK, access: "ok", data: { name: "Ship", status: "todo", status_name: "To do", done: false, can_edit: false } })
    const editor = await docEditor(todo(`data-checked="false" data-task-id="${TASK}"`, `<p><span data-type="entityMention" data-id="task:${TASK}" data-label="Ship"></span></p>`))
    await settle(60)
    act(() => void editor.commands.setTextSelection(3))
    press(editor, "Mod-Enter")
    await settle(60)
    expect(json(editor)).toContain('"checked":false')
    expect(posted.some((p) => p.url === "/doc/todoTask/check")).toBe(false)
    expect(toasts).toContain("Only the project's admins can change this task.")
  })

  it("puts back a box clicked on a task the reader can't change, on screen as in the doc", async () => {
    entities.set(`task:${TASK}`, { kind: "task", id: TASK, access: "ok", data: { name: "Ship", status: "todo", status_name: "To do", done: false, can_edit: false } })
    const editor = await docEditor(todo(`data-checked="false" data-task-id="${TASK}"`, `<p><span data-type="entityMention" data-id="task:${TASK}" data-label="Ship"></span></p>`))
    await settle(60)
    const box = editor.view.dom.querySelector<HTMLInputElement>("li input[type=checkbox]")!
    await act(async () => void fireEvent.click(box))
    await settle(60)
    expect(json(editor)).toContain('"checked":false')
    expect(box.checked).toBe(false)
    expect(toasts).toContain("Only the project's admins can change this task.")
  })

  it("leaves a tick that came from someone else alone: their tab sent it", async () => {
    const editor = await docEditor(todo(`data-checked="false" data-task-id="${TASK}"`, "<p>Ship</p>"))
    await settle(30)
    act(() => {
      const pos = 1
      const node = editor.state.doc.nodeAt(pos)!
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: true }).setMeta("y-sync$", { isChangeOrigin: true }))
    })
    await settle(30)
    expect(json(editor)).toContain('"checked":true')
    expect(posted.some((p) => p.url === "/doc/todoTask/check")).toBe(false)
  })
})

describe("the @ list in a doc", () => {
  it("offers the day a query names first, with a reminder on it", async () => {
    const editor = await docEditor()
    const items = (await mentionSuggestionOptions!.items!({ query: "tom", editor })) as Array<{ kind?: string; offer?: { label: string }; user_uuid?: string }>
    expect(items.slice(0, 2).map((i) => i.kind)).toEqual(["date", "remind"])
    expect(items[0].offer?.label).toBe("Tomorrow")
  })

  it("offers this doc's people first", async () => {
    const editor = await docEditor('<p>Ask <span data-type="mention" data-id="u-maya@0x2" data-label="Maya Chen">@Maya Chen</span></p>')
    const items = (await mentionSuggestionOptions!.items!({ query: "", editor })) as Array<{ user_uuid?: string }>
    expect(items.map((i) => i.user_uuid)).toEqual(["u-maya", "u-sam", "u-ravi"])
  })

  it("offers whoever the writer mentions most next, and counts each one picked", async () => {
    countMention("u-ravi")
    countMention("u-ravi")
    const editor = await docEditor('<p>Ask <span data-type="mention" data-id="u-maya@0x2" data-label="Maya Chen">@Maya Chen</span></p>')
    const items = (await mentionSuggestionOptions!.items!({ query: "", editor })) as Array<{ user_uuid?: string }>
    // The doc's own people first, then the writer's habit, then the workspace's order.
    expect(items.map((i) => i.user_uuid)).toEqual(["u-maya", "u-ravi", "u-sam"])

    // (Ravi, not Maya: the doc's access answer for Maya is kept a minute, and the test below asks it.)
    await act(async () => void editor.commands.focus("end"))
    await type(editor, " @Ra")
    await vi.waitFor(() => expect(document.querySelector("[data-mention-list]")?.textContent).toContain("Ravi"), { timeout: 3000 })
    press(editor, "Enter")
    await vi.waitFor(() => expect(mentionCounts().get("u-ravi")).toBe(3), { timeout: 3000 })
    expect(json(editor)).toContain('"id":"u-ravi@0x3"')
  })
})

/** Types into the editor as the browser hands it keys (input rules and menus run). */
async function type(editor: Editor, text: string) {
  await act(async () => {
    for (const ch of text) {
      const { from, to } = editor.state.selection
      const insert = () => editor.state.tr.insertText(ch, from, to)
      if (!editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))) editor.view.dispatch(insert())
    }
  })
}

describe("mentioning someone who can't open the doc", () => {
  it("says so in the @ list, and picking them shares the doc with them to view", async () => {
    const editor = await docEditor("<p></p>")
    await type(editor, "@Ma")
    await vi.waitFor(() => expect(document.querySelector("[data-mention-list]")?.textContent).toContain("Can't open this doc"), { timeout: 3000 })
    expect(document.querySelector("[data-mention-list]")?.textContent).toContain("Share and mention")
    expect(posted.find((p) => p.url === "/doc/mentionAccess")?.body).toEqual({ doc_uuid: DOC, user_uuids: ["u-maya"] })
    press(editor, "Enter")
    // An invite, as the share dialog's: the server caps it at the writer's own level.
    await vi.waitFor(() => expect(posted.find((p) => p.url === "/doc/access/invite")).toBeTruthy(), { timeout: 3000 })
    expect(json(editor)).toContain('"id":"u-maya@0x2"')
    expect(posted.find((p) => p.url === "/doc/access/invite")?.body).toEqual({ doc_uuid: DOC, adds: [{ kind: "user", uuid: "u-maya", level: "view" }] })
    expect(posted.some((p) => p.url === "/doc/access/update")).toBe(false)
    expect(toasts).toContain("Shared with Maya")
  })

  it("offers no sharing to a writer the server says may not invite, and picking them only mentions them", async () => {
    mentionAnswer = { can_share: false, cant_open: ["u-maya"] }
    const editor = await docEditor("<p></p>")
    await type(editor, "@Ma")
    await vi.waitFor(() => expect(document.querySelector("[data-mention-list]")?.textContent).toContain("Can't open this doc"), { timeout: 3000 })
    expect(document.querySelector("[data-mention-list]")?.textContent).not.toContain("Share and mention")
    press(editor, "Enter")
    await vi.waitFor(() => expect(json(editor)).toContain('"id":"u-maya@0x2"'), { timeout: 3000 })
    await settle(60)
    expect(posted.some((p) => p.url === "/doc/access/invite" || p.url === "/doc/access/update")).toBe(false)
  })

  it("says nothing of who can open the doc to someone the server won't tell, and shares nothing", async () => {
    // Someone who can't write in the doc (a commenter) is answered as if it weren't there.
    mentionAnswer = "refused"
    const editor = await docEditor("<p></p>")
    await type(editor, "@Ma")
    await vi.waitFor(() => expect(document.querySelector("[data-mention-list]")?.textContent).toContain("Maya"), { timeout: 3000 })
    await vi.waitFor(() => expect(posted.some((p) => p.url === "/doc/mentionAccess")).toBe(true), { timeout: 3000 })
    await settle(60)
    const list = document.querySelector("[data-mention-list]")?.textContent ?? ""
    expect(list).not.toContain("Can't open this doc")
    expect(list).not.toContain("Share and mention")
    press(editor, "Enter")
    await vi.waitFor(() => expect(json(editor)).toContain('"id":"u-maya@0x2"'), { timeout: 3000 })
    await settle(60)
    expect(posted.some((p) => p.url === "/doc/access/invite" || p.url === "/doc/access/update")).toBe(false)
  })
})

describe("a project's tasks and board in a doc", () => {
  const T1 = "7a5c0000-0000-4000-8000-000000000011"
  const T2 = "7a5c0000-0000-4000-8000-000000000012"
  beforeEach(() => {
    board = {
      project_uuid: PROJECT,
      project_tasks_todo: [{ task_uuid: T1, task_name: "Write the post", task_status: "todo" }],
      project_tasks_done: [{ task_uuid: T2, task_name: "Book the room", task_status: "done" }],
      project_tasks_done_count: 1,
    }
  })

  it.each([
    ["tasks", "taskListEmbed", { projectId: PROJECT, show: "open" }],
    ["board", "boardEmbed", { projectId: PROJECT }],
  ] as const)("/%s puts the project picked in the doc, keeping only its id", async (id, type, attrs) => {
    const editor = await docEditor(`<p>/${id}</p>`)
    busFor(editor)!.on("openDialog", ({ id: dialog }: { id: string }) => {
      if (dialog === PICK_PROJECT) peekPick(PICK_PROJECT)?.answer({ id: PROJECT, name: "Launch" })
    })
    const entry = blockById("connectedSlash")!.slash!.find((s) => s.id === id)!
    await act(async () => entry.run(editor, { from: 1, to: 2 + id.length }))
    await vi.waitFor(() => expect(editor.getJSON().content?.find((n) => n.type === type)?.attrs).toMatchObject(attrs), { timeout: 3000 })
    expect(json(editor)).not.toContain("Launch")
    expect(json(editor)).not.toContain(`/${id}`)
  })

  it("reads the project's tasks again when its topic says one changed, once for a burst", async () => {
    entities.set(`project:${PROJECT}`, { kind: "project", id: PROJECT, access: "ok", data: { name: "Launch", can_edit: true }, topic: "message/LAUNCH" })
    await docEditor(`<div data-type="task-list-embed" data-project-id="${PROJECT}" data-show="open"></div>`, { freshReads: true })
    expect(await screen.findByText("Write the post", undefined, { timeout: 5000 })).toBeInTheDocument()
    const boardReads = () => gets.filter((u) => u.startsWith(`/project/taskListForKanban/${PROJECT}`)).length
    const before = boardReads()
    const todo = board.project_tasks_todo as unknown[]
    board = { ...board, project_tasks_todo: [...todo, { task_uuid: "7a5c0000-0000-4000-8000-000000000013", task_name: "Print the flyers", task_status: "todo" }] }
    act(() => {
      for (let i = 0; i < 3; i++) topics.get("message/LAUNCH")?.(JSON.stringify({ type: MqttMessageType.Task_Changed }))
    })
    expect(await screen.findByText("Print the flyers", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(boardReads()).toBe(before + 1)
  })

  it("lists the open tasks, live, and ticking one completes it for whoever may", async () => {
    await docEditor(`<div data-type="task-list-embed" data-project-id="${PROJECT}" data-show="open"></div>`)
    expect(await screen.findByText("Write the post", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText("Launch · Tasks")).toBeInTheDocument()
    expect(screen.queryByText("Book the room")).toBeNull()
    // Rows the editor's list styles can't reach (they bullet and indent li), and a
    // head that keeps the project's name on a phone: "Open project" is the arrow there.
    expect(screen.getByRole("list", { name: "Launch: open tasks" }).querySelector("li")).toBeNull()
    expect(screen.getByRole("link", { name: "Open project" }).firstElementChild).toHaveClass("max-sm:sr-only")
    await act(async () => screen.getByRole("button", { name: "Mark “Write the post” done" }).click())
    await settle()
    expect(posted.find((p) => p.url === "/task/updateTaskStatus")?.body).toEqual({ task_status: "done", task_uuid: T1, task_project_uuid: PROJECT })
  })

  it("lets a project member read the list but not tick it, as on the project's own list", async () => {
    entities.set(`project:${PROJECT}`, { kind: "project", id: PROJECT, access: "ok", data: { name: "Launch", can_edit: false } })
    await docEditor(`<div data-type="task-list-embed" data-project-id="${PROJECT}" data-show="all"></div>`)
    expect(await screen.findByText("Book the room", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Mark/ })).toBeNull()
  })

  it("tells someone outside the project they can't see it, and never its name", async () => {
    entities.set(`project:${PROJECT}`, { kind: "project", id: PROJECT, access: "none" })
    await docEditor(`<div data-type="task-list-embed" data-project-id="${PROJECT}"></div><div data-type="board-embed" data-project-id="${PROJECT}"></div>`)
    expect(await screen.findByText(/can't see this project's tasks/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText(/can't see this project's board/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("Launch")
  })

  it("tries the project's read again from Try again, when that is what failed", async () => {
    failReads = true
    await docEditor(`<div data-type="task-list-embed" data-project-id="${PROJECT}" data-show="open"></div>`)
    const again = await screen.findByRole("button", { name: "Try again" }, { timeout: 5000 })
    expect(screen.getByText(/Couldn't load the tasks/)).toBeInTheDocument()
    failReads = false
    await act(async () => again.click())
    expect(await screen.findByText("Write the post", undefined, { timeout: 5000 })).toBeInTheDocument()
  })

  it("says Mine couldn't load when the reader's own profile can't be read, rather than loading for good", async () => {
    failSelf = true
    await docEditor(`<div data-type="task-list-embed" data-project-id="${PROJECT}" data-show="mine"></div>`, { freshReads: true })
    expect(await screen.findByText(/Couldn't load the tasks/, undefined, { timeout: 8000 })).toBeInTheDocument()
  }, 15_000)

  it("draws the board's columns with their cards", async () => {
    await docEditor(`<div data-type="board-embed" data-project-id="${PROJECT}"></div>`)
    expect(await screen.findByText("Write the post", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole("listitem", { name: "To do, 1" })).toBeInTheDocument()
    expect(screen.getByRole("listitem", { name: "Done, 1" })).toBeInTheDocument()
  })
})

describe("the project picker", () => {
  it("says it couldn't load the projects, and tries again", async () => {
    failProjects = true
    const editor = await docEditor("<p></p>")
    void pickProject(busFor(editor), "tasks")
    render(
      <Provider store={store}>
        <MediaQueryProvider>
          <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <ProjectPickerDialog docId={DOC} onClose={() => undefined} />
          </SWRConfig>
        </MediaQueryProvider>
      </Provider>,
    )
    expect(await screen.findByText("Couldn't load your projects", undefined, { timeout: 5000 })).toBeInTheDocument()
    failProjects = false
    await act(async () => screen.getByRole("button", { name: "Try again" }).click())
    await vi.waitFor(() => expect(screen.queryByText("Couldn't load your projects")).toBeNull(), { timeout: 5000 })
  })
})

describe("a picker React draws twice", () => {
  // React may throw away a render it hasn't shown (a part that suspends, an
  // urgent update cutting in) and run it again from the start. The question
  // must still be there on that second run, or the picker closes unseen and
  // "/link to page" does nothing (subpages.spec.ts:198, 25 Oct).
  it("still holds the question it was asked when its first render is thrown away", async () => {
    const editor = await docEditor("<p></p>")
    let picked: Picked | null | undefined
    void pickProject(busFor(editor), "tasks").then((p) => (picked = p))
    let thrown = false
    const later = new Promise<void>((done) => setTimeout(done, 20))
    function SuspendsOnce() {
      if (!thrown) {
        thrown = true
        throw later
      }
      return null
    }
    const onClose = vi.fn()
    render(
      <Provider store={store}>
        <MediaQueryProvider>
          <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <React.Suspense fallback={null}>
              <ProjectPickerDialog docId={DOC} onClose={onClose} />
              <SuspendsOnce />
            </React.Suspense>
          </SWRConfig>
        </MediaQueryProvider>
      </Provider>,
    )
    expect(await screen.findByRole("dialog", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(picked).toBeUndefined()
  })
})

describe("a date in a line", () => {
  // The day these lines are read on: the 15th is Tomorrow.
  pinTestClock(new Date(2026, 9, 14, 10))

  it("draws a day that is on no calendar as Date, rather than taking the doc down", async () => {
    const editor = await docEditor("<p>Due</p>")
    // As an older client could write it into the live doc, past the HTML's check.
    await act(async () => void editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Due " }, { type: "dateMention", attrs: { date: "2026-02-30" } }] }] }))
    expect(await screen.findByText("Date")).toBeInTheDocument()
  })

  it("opens nothing for a guest, who has no Later and can't change the doc", async () => {
    await docEditor('<p>Ship the post <time data-type="date-mention" datetime="2026-10-15"></time></p>', { guest: true })
    const chip = document.querySelector<HTMLElement>("[data-date-chip]")!
    expect(chip.getAttribute("role")).toBeNull()
    await act(async () => chip.click())
    await settle(60)
    expect(document.querySelector("[data-date-popover]")).toBeNull()
  })

  it("moves to another day, and the writer's own reminder moves with it", async () => {
    laterItems = [{ id: "later-9" }]
    const editor = await docEditor('<p>Ship the post <time data-type="date-mention" datetime="2026-10-15" data-reminder="later-9"></time></p>', { freshReads: true })
    await act(async () => (await screen.findByText("Tomorrow")).click())
    await screen.findByText("You'll be reminded on this day.", undefined, { timeout: 3000 })
    const day = (await screen.findAllByRole("gridcell")).find((cell) => cell.textContent === "16")!
    await act(async () => void fireEvent.click(day.querySelector("button") ?? day))
    await settle(60)
    expect(json(editor)).toContain('"date":"2026-10-16","reminder":"later-9"')
    expect(posted.find((p) => p.url === "/later/update")?.body).toEqual({ id: "later-9", remind_at: new Date(2026, 9, 16, 9).toISOString() })
  })

  it("Remove reminder takes the writer's reminder off Later and the line", async () => {
    laterItems = [{ id: "later-9" }]
    const editor = await docEditor('<p>Ship the post <time data-type="date-mention" datetime="2026-10-15" data-reminder="later-9"></time></p>', { freshReads: true })
    await act(async () => (await screen.findByText("Tomorrow")).click())
    await screen.findByText("You'll be reminded on this day.", undefined, { timeout: 3000 })
    await act(async () => (await screen.findByRole("button", { name: "Remove reminder" })).click())
    await settle(60)
    expect(posted.find((p) => p.url === "/later/delete")?.body).toEqual({ id: "later-9" })
    expect(json(editor)).not.toContain("later-9")
    expect(document.querySelector("[data-date-popover]")).toBeNull()
  })

  it("reads as it does today, and Remind me puts it in Later and gives it a bell", async () => {
    const editor = await docEditor('<p>Ship the post <time data-type="date-mention" datetime="2026-10-15"></time></p>')
    const chip = await screen.findByText("Tomorrow")
    await act(async () => chip.click())
    const remind = await screen.findByRole("button", { name: /^Remind me/ })
    await act(async () => remind.click())
    await settle(60)
    const saved = posted.find((p) => p.url === "/later/save")?.body
    expect(saved).toMatchObject({ item_type: "reminder", link: `/app/doc/${DOC}`, title: "Ship the post 15 Oct 2026", remind_at: new Date(2026, 9, 15, 9).toISOString() })
    expect(json(editor)).toContain('"reminder":"later-1"')
  })
})

