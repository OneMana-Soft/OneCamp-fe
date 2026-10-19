import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import path from "path"

// The chat programme's three stacks (a channel's, a DM's and a group's own
// views, lists, rows, thread panels, phone pages, composers, uploads, slices
// and live handlers) are being folded into one Conversation model behind its
// hosts: components/conversation (ConversationView, MessageList, ComposerHost,
// ThreadPanel), store/conversations, lib/conversation and lib/realtime (chat
// A1). Step 1 put the hosts in front of the stacks; CHAT-A1B moves the stacks
// in and deletes them.
//
// So the split can't harden into a third copy, nothing new may reach into a
// stack from outside it: new work builds on the hosts. Today's importers are
// the baseline below, by name, and it only shrinks: an import that goes away
// must leave the list with it.

const STACKS: Record<string, string[]> = {
  channel: [
    "components/views/ChannelView.tsx",
    "components/channel/chanelIdDesktop.tsx",
    "components/channel/channelIdMobile.tsx",
    "components/channel/channelMessages.tsx",
    "components/channel/channelMessageList.tsx",
    "components/channel/chanelMessage.tsx",
    "components/channel/channelMessageMobile.tsx",
    "components/rightPanel/channelComments.tsx",
    "components/mobilePost/mobilePost.tsx",
    "components/textInput/mobileChannelTextInput.tsx",
    "components/textInput/mobileChannelPostTextInput.tsx",
    "components/fileUpload/channelFileUpload.tsx",
    "components/fileUpload/channelCommentFileUpload.tsx",
    "store/slice/channelSlice.ts",
    "store/slice/channelCommentSlice.ts",
    "hooks/usePostMessageHandlers.ts",
  ],
  dm: [
    "components/views/ChatView.tsx",
    "components/chat/chatIdDesktop.tsx",
    "components/chat/chatIdMobile.tsx",
    "components/chat/chatMessages.tsx",
    "components/chat/chatMessageList.tsx",
    "components/chat/chatMessage.tsx",
    "components/chat/chatMessageMobile.tsx",
    "components/rightPanel/chatComments.tsx",
    "components/mobileChatMessage/mobileChat.tsx",
    "components/textInput/mobileChatTextInput.tsx",
    "components/textInput/mobileChatMessageTextInput.tsx",
    "components/fileUpload/chatFileUpload.tsx",
    "components/fileUpload/chatCommentFileUpload.tsx",
    "store/slice/chatSlice.ts",
    "store/slice/chatCommentSlice.ts",
    "hooks/useChatMessageHandlers.ts",
  ],
  group: [
    "components/views/GroupChatView.tsx",
    "components/groupChat/chatGrpIdDesktop.tsx",
    "components/groupChat/grpChatIdMobile.tsx",
    "components/groupChat/groupChatMessages.tsx",
    "components/groupChat/groupChatMessageList.tsx",
    "components/groupChat/groupChatMessage.tsx",
    "components/groupChat/groupChatMessageMobile.tsx",
    "components/rightPanel/groupChatComments.tsx",
    "components/mobileChatMessage/mobileGroupChat.tsx",
    "components/textInput/mobileGroupChatTextInput.tsx",
    "components/textInput/mobileGroupChatMessageTextInput.tsx",
    "components/fileUpload/groupChatFileUpload.tsx",
    "components/fileUpload/groupChatCommentFileUpload.tsx",
    "store/slice/groupChatSlice.ts",
    // A DM's and a group's replies share a slice, and their live messages a handler.
    "store/slice/chatCommentSlice.ts",
    "hooks/useChatMessageHandlers.ts",
  ],
  // Today's virtual list, which the stacks reach through the MessageList host.
  list: ["components/message/MessaageListVirtua.tsx"],
}

/** What may reach into any stack: the hosts, and the store that registers the slices. */
const HOSTS = [/^components\/conversation\//, /^lib\/conversation\//, /^lib\/realtime\//, /^store\/conversations\.ts$/, /^store\/store\.ts$/]

/** The AI edition's own code, which the AI-free web doesn't hold: its baseline entries may name files that aren't there. */
const AI_ONLY = /^(components|hooks|lib)\/ai\//

/**
 * Today's importers of a stack's internals from outside it: may only shrink.
 * CHAT-A1B empties it.
 */
const BASELINE: Record<string, string[]> = {
  "components/mobileChatMessage/mobileChat.tsx": ["app/app/chat/[chat-id]/[message-id]/page.tsx"],
  "components/mobileChatMessage/mobileGroupChat.tsx": ["app/app/chat/group/[chat-grp-id]/[message-id]/page.tsx"],
  "components/mobilePost/mobilePost.tsx": ["app/app/channel/[channel-id]/[post-id]/page.tsx"],
  "components/textInput/mobileChannelPostTextInput.tsx": ["app/app/channel/[channel-id]/[post-id]/page.tsx"],
  "components/textInput/mobileChatMessageTextInput.tsx": ["app/app/chat/[chat-id]/[message-id]/page.tsx"],
  "components/textInput/mobileGroupChatMessageTextInput.tsx": ["app/app/chat/group/[chat-grp-id]/[message-id]/page.tsx"],
  "components/views/ChannelView.tsx": ["app/app/channel/[channel-id]/page.tsx", "components/split/SplitPane.tsx"],
  "components/views/ChatView.tsx": ["app/app/chat/[chat-id]/page.tsx", "components/split/SplitPane.tsx"],
  "components/views/GroupChatView.tsx": ["app/app/chat/group/[chat-grp-id]/page.tsx", "components/split/SplitPane.tsx"],
  "hooks/useChatMessageHandlers.ts": ["hooks/useMqttMessageHandler.ts"],
  "hooks/usePostMessageHandlers.ts": ["hooks/useMqttMessageHandler.ts"],
  "store/slice/channelCommentSlice.ts": ["hooks/useSaveEdit.ts", "hooks/useUploadFile.ts", "store/slice/chatCommentSlice.ts", "store/slice/createTaskCommentSlice.ts"],
  "store/slice/channelSlice.ts": [
    "app/app/channel/[channel-id]/[post-id]/page.tsx", "components/ai/ActionConfirmation.tsx", "components/groupChat/groupChatMessages.tsx",
    "components/message/emptyConversations.tsx", "components/onboarding/ChannelWelcome.tsx", "hooks/useDeleteMessage.ts", "hooks/useHydrateUserSidebar.ts",
    "hooks/useLinkTarget.ts", "hooks/useSaveEdit.ts", "hooks/useUploadFile.ts", "store/slice/chatCommentSlice.ts", "store/slice/chatSlice.ts",
    "store/slice/createTaskCommentSlice.ts", "store/slice/fwdMessageSlice.ts", "store/slice/groupChatSlice.ts", "store/slice/taskInfoSlice.ts",
  ],
  "store/slice/chatCommentSlice.ts": ["hooks/useSaveEdit.ts", "hooks/useUploadFile.ts"],
  "store/slice/chatSlice.ts": [
    "app/app/chat/[chat-id]/[message-id]/page.tsx", "components/ai/ActionConfirmation.tsx", "components/channel/channelMessages.tsx",
    "components/chat/chatUserList.tsx", "components/drawers/groupChatOptionsDrawer.tsx", "components/groupChat/chatGrpIdDesktop.tsx",
    "components/groupChat/groupChatMessages.tsx", "components/message/emptyConversations.tsx", "components/rightPanel/groupChatComments.tsx",
    "components/views/GroupChatView.tsx", "hooks/useDeleteMessage.ts", "hooks/useHydrateUserSidebar.ts", "hooks/useLinkTarget.ts",
    "hooks/useSaveEdit.ts", "hooks/useUploadFile.ts", "store/slice/groupChatSlice.ts",
  ],
  "store/slice/groupChatSlice.ts": [
    "app/app/chat/group/[chat-grp-id]/[message-id]/page.tsx", "components/ai/ActionConfirmation.tsx", "components/dialog/createChatMessageDialog.tsx",
    "components/message/emptyConversations.tsx", "hooks/useDeleteMessage.ts", "hooks/useLinkTarget.ts", "hooks/useSaveEdit.ts", "hooks/useUploadFile.ts",
  ],
}

const ROOTS = ["app", "components", "context", "hooks", "lib", "services", "store", "types"]
const importRe = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function resolve(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = spec.slice(2)
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile() && /\.(t|j)sx?$/.test(c)) return c
  }
  return null
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p)
  }
  return out
}

/** Who imports each stack's internals from outside it (and outside the hosts), by internal. */
function reaches(): Map<string, Set<string>> {
  const owners = new Map<string, string[]>()
  for (const [stack, files] of Object.entries(STACKS)) for (const f of files) owners.set(f, [...(owners.get(f) ?? []), stack])
  const found = new Map<string, Set<string>>()
  for (const root of ROOTS) {
    for (const file of sources(root)) {
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      for (const m of src.matchAll(importRe)) {
        const target = resolve(m[1] ?? m[2], file)
        const stacks = target ? owners.get(target) : undefined
        if (!target || !stacks || target === file) continue
        const own = owners.get(file) ?? []
        if (own.some((s) => stacks.includes(s)) || HOSTS.some((h) => h.test(file))) continue
        if (!found.has(target)) found.set(target, new Set())
        found.get(target)!.add(file)
      }
    }
  }
  return found
}

describe("the chat stacks (chat A1, until CHAT-A1B folds them into the Conversation model)", () => {
  const found = reaches()

  it("are reached from outside only by the importers they had", () => {
    const fresh: string[] = []
    for (const [target, importers] of found) {
      for (const f of importers) if (!BASELINE[target]?.includes(f)) fresh.push(`${f} -> ${target}`)
    }
    expect(fresh, "build on the hosts (components/conversation, store/conversations, lib/conversation, lib/realtime) instead of a per-kind stack's internals").toEqual([])
  })

  it("lose importers from the baseline as they go: it only shrinks", () => {
    const gone: string[] = []
    for (const [target, importers] of Object.entries(BASELINE)) {
      for (const f of importers) {
        if (found.get(target)?.has(f)) continue
        if (!existsSync(f) && AI_ONLY.test(f)) continue
        gone.push(`${f} -> ${target}`)
      }
    }
    expect(gone, "these no longer reach into a stack: take them out of BASELINE").toEqual([])
  })

  it("would see a new one: a file outside the stacks reaching an internal is found", () => {
    // The rule's own check: the split pane reaches the views (baselined), and
    // the hosts' MessageList reaches today's list, which isn't counted.
    expect(found.get("components/views/ChannelView.tsx")?.has("components/split/SplitPane.tsx")).toBe(true)
    expect(found.get("components/message/MessaageListVirtua.tsx")).toBeUndefined()
  })
})
