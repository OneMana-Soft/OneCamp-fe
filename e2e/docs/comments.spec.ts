import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, docInfo, stubBackend } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, type Person } from "./twoPeople"

// Anchored comments with two people in one doc (docs programme B7;
// collaboration.md P1-A): a thread sits on the words it was started on, stays
// on them while the other person types around them and after a reload, says
// "Original text was changed" when they are deleted, and offers "Reattach
// here", one click, when the same words are in the doc again (D-9: never on
// its own). The collaboration socket is answered by the relay and the threads
// API by a small in-test server both browsers share; nothing reaches a real
// server.

const DOC = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f"

type Json = Record<string, unknown>

/** The threads API, in this process, for everyone's browser: what one starts, the other reads. */
class ThreadsServer {
    threads: Json[] = []
    private n = 0

    private view(t: Json): Json {
        return { ...t, participants: [], unread: false, can_reply: true, can_resolve: true, can_moderate: true }
    }

    async attach(page: Page, testInfo: TestInfo, person: Person) {
        const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
        await page.route(
            (url) => url.origin !== app.origin && /^\/threads(\/|$)/.test(url.pathname),
            async (route) => {
                const request = route.request()
                const headers = {
                    "access-control-allow-origin": request.headers()["origin"] || app.origin,
                    "access-control-allow-credentials": "true",
                    "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
                    "access-control-allow-methods": "GET,POST,OPTIONS",
                }
                if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
                const answer = (json: unknown, status = 200) => route.fulfill({ status, headers, json })
                const path = new URL(request.url()).pathname
                const body = (request.postDataJSON() ?? {}) as Json
                const now = new Date(Date.now() + this.n * 1000).toISOString()
                if (path === "/threads" && request.method() === "GET") {
                    return answer({ data: { threads: this.threads.map((t) => this.view(t)) } })
                }
                if (path === "/threads" && request.method() === "POST") {
                    const id = `00000000-0000-4000-8000-${String(++this.n).padStart(12, "0")}`
                    const thread = {
                        id,
                        resource_kind: body.resource_kind,
                        resource_uuid: body.resource_uuid,
                        anchor: body.anchor,
                        status: "open",
                        created_by: person.user_uuid,
                        created_at: now,
                        updated_at: now,
                        comments: [{ comment_uuid: `${id}-c1`, thread_id: id, comment_text: body.body, comment_by: person, comment_created_at: now }],
                    }
                    this.threads.push(thread)
                    return answer({ data: this.view(thread) })
                }
                const [, , id, act] = path.split("/")
                const thread = this.threads.find((t) => t.id === id)
                if (!thread) return answer({ msg: "That thread or page no longer exists." }, 404)
                if (!act && request.method() === "GET") return answer({ data: this.view(thread) })
                if (act === "reanchor") Object.assign(thread, { anchor: body.anchor, updated_at: now })
                if (act === "resolve") Object.assign(thread, { status: "resolved", resolved_by: person.user_uuid, resolved_at: now, updated_at: now })
                if (act === "reopen") Object.assign(thread, { status: "open", updated_at: now })
                if (act === "replies") {
                    const comment = { comment_uuid: `${id}-c${(thread.comments as Json[]).length + 1}`, thread_id: id, comment_text: body.body, comment_by: person, comment_created_at: now }
                    ;(thread.comments as Json[]).push(comment)
                    return answer({ data: comment })
                }
                return answer({ data: thread })
            },
        )
    }
}

interface Tab {
    page: Page
    body: Locator
    close(): Promise<void>
}

/** A doc opened as a person, on the relay and the threads server (A1's harness, with threads). */
async function open(browser: Browser, testInfo: TestInfo, relay: CollabRelay, threads: ThreadsServer, person: Person): Promise<Tab> {
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await stubBackend(page, testInfo, {
        [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch plan", doc_body: "<p></p>", edit: true }),
        "/user/profile": { msg: "ok", data: person },
        "/auth/token": { data: { token: `e2e-${person.user_name}` } },
    })
    // After the stub, so it answers the threads first.
    await threads.attach(page, testInfo, person)
    await relay.attach(page, person.user_full_name)
    await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const body = page.locator('.doc-editor .ProseMirror[contenteditable="true"]')
    await expect(body).toBeVisible({ timeout: 60_000 })
    return { page, body, close: () => context.close() }
}

/** The doc's editor, as Tiptap hangs it on its element. */
type EditorEl = HTMLElement & {
    editor?: { state: { selection: { from: number; to: number } }; view: { posAtDOM(node: Node, offset: number): number } }
}

/**
 * Selects words in a tab's doc, as a person dragging over them would; with
 * caret, puts the caret just before them, as a click there would (a key such
 * as Ctrl+Home may belong to the page instead). Then waits for the editor to
 * hold that selection: it reads the page's selection a moment later, and a
 * key pressed before then (⌘⇧M) would act on the old one.
 */
async function select(tab: Tab, words: string, caret = false) {
    await tab.body.focus()
    const want = await tab.body.evaluate(
        (el, { words, caret }) => {
            const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
            for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                const at = n.textContent?.indexOf(words) ?? -1
                if (at < 0 || (n.parentElement && n.parentElement.closest(".collaboration-cursor__caret"))) continue
                const range = document.createRange()
                range.setStart(n, at)
                range.setEnd(n, caret ? at : at + words.length)
                const sel = window.getSelection()!
                sel.removeAllRanges()
                sel.addRange(range)
                const view = (el as EditorEl).editor?.view
                if (!view) return null
                const from = view.posAtDOM(n, at)
                return [from, caret ? from : view.posAtDOM(n, at + words.length)]
            }
            throw new Error(`"${words}" isn't in the doc`)
        },
        { words, caret },
    )
    if (!want) return
    await expect
        .poll(() => tab.body.evaluate((el) => {
            const s = (el as EditorEl).editor?.state.selection
            return s ? [s.from, s.to] : null
        }), { timeout: 10_000 })
        .toEqual(want)
}

/**
 * A tab's doc as its words read: the other person's caret, drawn in the text
 * with their name ("So: priyaWe ship"), left out.
 */
const docText = (tab: Tab) =>
    tab.body.evaluate((el) => {
        const copy = el.cloneNode(true) as HTMLElement
        copy.querySelectorAll(".collaboration-cursor__caret").forEach((caret) => caret.remove())
        return copy.textContent ?? ""
    })

/** The words a tab's doc draws as a thread's. */
const highlighted = (tab: Tab) => tab.body.locator(".thread-anchor").allTextContents().then((parts) => parts.join(""))

/** Sam starts a thread on words with ⌘⇧M (Ctrl+Shift+M here) and the one-line composer. */
async function comment(tab: Tab, words: string, text: string) {
    await select(tab, words)
    await tab.page.keyboard.press("Control+Shift+M")
    const draft = tab.page.getByRole("textbox", { name: "Comment on the selected text" })
    await expect(draft).toBeFocused({ timeout: 30_000 })
    await tab.page.keyboard.type(text)
    // Return is a new line; ⌘↵ sends.
    await tab.page.keyboard.press("Control+Enter")
    await expect(tab.page.getByRole("article", { name: new RegExp(`Comment on “${words}”`) })).toBeVisible({ timeout: 15_000 })
}

test.describe.configure({ mode: "serial" })

test("a comment sits on its words, while someone types before them and after a reload", async ({ browser }, testInfo) => {
    const relay = new CollabRelay()
    const threads = new ThreadsServer()
    const sam = await open(browser, testInfo, relay, threads, SAM)
    const priya = await open(browser, testInfo, relay, threads, PRIYA)

    await sam.body.click()
    await sam.page.keyboard.type("We ship on Thursday.")
    await expect.poll(() => docText(priya), { timeout: 15_000 }).toContain("We ship on Thursday.")

    await comment(sam, "ship on Thursday", "Is this date firm?")
    await expect.poll(() => highlighted(sam), { timeout: 15_000 }).toBe("ship on Thursday")
    expect(threads.threads).toHaveLength(1)
    expect((threads.threads[0].anchor as Json).kind).toBe("yrange")

    // Priya types before the words: the thread stays on them. ("We" alone:
    // a highlight drawn in her copy would split "We ship" in two.)
    await select(priya, "We", true)
    await priya.page.keyboard.type("So: ")
    await expect.poll(() => docText(sam), { timeout: 15_000 }).toContain("So: We ship")
    await expect.poll(() => highlighted(sam), { timeout: 15_000 }).toBe("ship on Thursday")

    // A reload reads the thread again, on the same words.
    await sam.page.reload({ waitUntil: "domcontentloaded" })
    await expect(sam.body).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => highlighted(sam), { timeout: 30_000 }).toBe("ship on Thursday")

    await sam.close()
    await priya.close()
})

test("deleted words say so, and the same words again offer Reattach here, one click", async ({ browser }, testInfo) => {
    const relay = new CollabRelay()
    const threads = new ThreadsServer()
    const sam = await open(browser, testInfo, relay, threads, SAM)
    const priya = await open(browser, testInfo, relay, threads, PRIYA)

    await sam.body.click()
    await sam.page.keyboard.type("Launch on Friday after review.")
    await expect.poll(() => docText(priya), { timeout: 15_000 }).toContain("after review")
    await comment(sam, "on Friday", "Friday is a holiday.")
    const card = sam.page.getByRole("article", { name: /Comment on “on Friday”/ })

    // Priya deletes the words: the thread keeps its quote and says what happened.
    await select(priya, "on Friday ")
    await priya.page.keyboard.press("Backspace")
    await expect.poll(() => docText(sam), { timeout: 15_000 }).toContain("Launch after review.")
    await expect(card.getByText("Original text was changed")).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => highlighted(sam)).toBe("")
    // Nothing moves it back on its own.
    await expect(card.getByRole("button", { name: /Reattach/ })).toHaveCount(0)

    // The same words, typed again: offered back, never applied unasked.
    await priya.page.keyboard.press("Control+End")
    await priya.page.keyboard.type(" Or on Friday")
    await expect.poll(() => docText(sam), { timeout: 15_000 }).toContain("Or on Friday")
    const reattach = card.getByRole("button", { name: "Reattach here" })
    await expect(reattach).toBeVisible({ timeout: 15_000 })
    expect(await highlighted(sam)).toBe("")

    await reattach.click()
    await expect.poll(() => highlighted(sam), { timeout: 15_000 }).toBe("on Friday")
    await expect(card.getByText("Original text was changed")).toHaveCount(0)
    expect((threads.threads[0].anchor as Json).quote).toBe("on Friday")

    await sam.close()
    await priya.close()
})
