import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// ONE ASK, AND ALWAYS THE ASK (UX-CHAT-H1, V-724). A phone thread page's six
// delete handlers (mobilePost, mobileChat, mobileGroupChat: the root and a
// reply each) delete at once: the sheet has asked (eb9927f9e; they asked a
// second time before). So a delete runs with no question the moment any path
// reaches a handler without going through MessageActionSheet's "Delete this
// message?". This holds the one path, link by link:
//   page handler -> <MobileMessage>/<MobileMessageCommentList> deleteMessage
//   -> MobileMessage's long press, into openUI({ key: '*LongPress', data })
//   -> the drawer UnifiedUIManager draws for that key -> MessageActionSheet
//   -> deleteMessage only from the question's Delete.
// threadSheets.test.tsx proves each drawer asks; heads/UX-CHAT-H1/ONE-ASK.txt
// is the grep this test keeps.

const read = (p: string) => readFileSync(p, "utf8")

const PAGES = {
  "components/mobilePost/mobilePost.tsx": ["handleDeletePost", "handleDeletePostComment"],
  "components/mobileChatMessage/mobileChat.tsx": ["handleDeleteChat", "handleDeleteChatComment"],
  "components/mobileChatMessage/mobileGroupChat.tsx": ["handleDeleteChat", "handleDeleteChatComment"],
} as const

/** The long-press keys a thread page's messages open (they pass no docId, so never docCommentLongPress). */
const KEYS = {
  postMessageLongPress: "postMessageLongPressDrawer",
  postCommentLongPress: "postCommentMessageLongPressDrawer",
  dmChatMessageLongPress: "dmChatMessageLongPressDrawer",
  dmChatCommentLongPress: "dmChatCommentMessageLongPressDrawer",
  dmGroupChatMessageLongPress: "dmGroupChatMessageLongPressDrawer",
} as const

/** The drawer file a thread drawer resolves to, following one-line wrappers to the file that draws the sheet. */
function sheetOf(file: string, seen: string[] = []): string[] {
  const src = read(`components/drawers/${file}.tsx`)
  if (src.includes("<MessageActionSheet")) return [...seen, file]
  const wrapped = src.match(/from "@\/components\/drawers\/(\w+)"/)
  if (!wrapped || seen.length > 3) return [...seen, file, "(no sheet)"]
  return sheetOf(wrapped[1], [...seen, file])
}

/** A handler's body, comments out and spaces squeezed: from its `=> {` to the brace that closes it. */
function bodyOf(src: string, h: string): string {
  const at = src.indexOf(`const ${h} = (`)
  const open = src.indexOf("{", src.indexOf("=>", at))
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}" && --depth === 0)
      return src.slice(open + 1, i).replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").trim()
  }
  return "(unclosed)"
}

describe("a phone thread page deletes only after the sheet's question", () => {
  for (const [page, handlers] of Object.entries(PAGES)) {
    it(`${page}: each handler is handed only to the message it deletes, and asks nothing itself`, () => {
      const src = read(page)
      for (const h of handlers) {
        const uses = src.match(new RegExp(`\\b${h}\\b`, "g")) ?? []
        // Its definition and the one prop: no button, key or effect calls it.
        expect(uses.length, `${page}: ${h} is used ${uses.length - 1} times, not once`).toBe(2)
        expect(src, `${page}: ${h} is not the deleteMessage of a message`).toMatch(new RegExp(`deleteMessage=\\{${h}\\}`))
        // Its body is the empty-id guard and its execute call, nothing else: no question by any other means.
        const exec = `execute${h.slice("handle".length)}`
        expect(bodyOf(src, h), `${page}: ${h} does more than ${exec}`).toMatch(new RegExp(`^if ?\\(!\\w+\\) return ${exec}\\([\\w, ]*\\);?$`))
      }
      expect(src, `${page}: a page that asks too asks twice`).not.toMatch(/confirmAlert|\bconfirm\(|DeleteConfirm|AlertDialog/)
      expect(src, `${page}: a thread page's message took a docId`).not.toMatch(/\bdocId\b/)
      // The props go to MobileMessage (the root) and MobileMessageCommentList (the replies), nothing else.
      const takers = [...src.matchAll(/<(\w+)\b[^>]*?deleteMessage=\{handleDelete/g)].map((m) => m[1])
      expect(new Set(takers)).toEqual(new Set(["MobileMessage", "MobileMessageCommentList"]))
    })
  }

  it("the reply list hands each reply's delete to MobileMessage, and nowhere else", () => {
    const list = read("components/mobileMessage/mobileMessageCommentList.tsx")
    expect(list.match(/deleteMessage\(/g)).toHaveLength(1)
    expect(list).toMatch(/<MobileMessage[\s\S]*?deleteMessage=\{\(id: string\)=>\{deleteMessage\(id, idx\)\}\}/)
  })

  it("MobileMessage runs deleteMessage only from the long-press sheet's data", () => {
    const msg = read("components/mobileMessage/mobileMessage.tsx")
    const calls = [...msg.matchAll(/deleteMessage\(/g)].map((m) => m.index!)
    expect(calls.length).toBeGreaterThan(0)
    for (const at of calls) {
      const before = msg.slice(0, at)
      const opened = before.lastIndexOf("openUI({")
      // Each call sits in `data: { deleteMessage: () => { deleteMessage(...) } }` of the nearest openUI.
      expect(opened, "a deleteMessage( outside an openUI").toBeGreaterThan(-1)
      expect(before.slice(opened)).toMatch(/^openUI\(\{\s*key: '\w+LongPress',\s*data: \{[\s\S]*deleteMessage: \(\) => \{\s*$/)
    }
  })

  it("every long-press key a thread page opens is drawn as MessageActionSheet", () => {
    const manager = read("components/ui/UnifiedUIManager.tsx")
    for (const [key, file] of Object.entries(KEYS)) {
      expect(manager, `${key} is not drawn from ${file}`).toMatch(new RegExp(`import\\("@/components/drawers/${file}"\\)`))
      expect(manager).toMatch(new RegExp(`deleteMessage=\\{ui\\.${key}\\.data\\.deleteMessage\\}`))
      const chain = sheetOf(file)
      expect(chain.at(-1), `${key}: ${chain.join(" -> ")}`).not.toBe("(no sheet)")
      expect(read(`components/drawers/${chain.at(-1)}.tsx`)).toMatch(/deleteMessage=\{deleteMessage\}/)
    }
  })

  it("the sheet calls deleteMessage only from its question's Delete", () => {
    const sheet = read("components/drawers/messageActionSheet.tsx")
    const calls = sheet.match(/\bdeleteMessage\b(?!:)/g) ?? []
    // The destructured prop and the question's Delete button: nothing else touches it.
    expect(calls).toHaveLength(2)
    expect(sheet).toMatch(/<DeleteConfirm[\s\S]*?<Button size="lg" variant="destructive" onClick=\{then\(deleteMessage, 100\)\}>\s*Delete\s*<\/Button>\s*<\/DeleteConfirm>/)
    expect(sheet).toMatch(/label="Delete message" danger onClick=\{\(\) => setConfirmingDelete\(true\)\}/)
  })
})
