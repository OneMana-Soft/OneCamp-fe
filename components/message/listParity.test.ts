import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Channels, DMs and groups are three copies of one conversation until the one
// model replaces them (PROGRAM CH1): what A0 gave the list reaches all three.
const read = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8")
const KINDS = [
  { loader: "components/channel/channelMessageList.tsx", messages: "components/channel/channelMessages.tsx" },
  { loader: "components/chat/chatMessageList.tsx", messages: "components/chat/chatMessages.tsx" },
  { loader: "components/groupChat/groupChatMessageList.tsx", messages: "components/groupChat/groupChatMessages.tsx" },
]

describe.each(KINDS)("$messages", ({ loader, messages }) => {
  it("pages back from the latest page's has_more, keeps it on a failure, and offers Try again", () => {
    const src = read(loader)
    expect(src).toMatch(/useOlderPages\(\{\s*latestHasMore: latestMsg\.data\?\.data\?\.has_more,/)
    expect(src).toContain("retryOlder={retryOlder}")
    // "Has more" is never turned off as a page is asked for: only an answer does.
    expect(src).not.toMatch(/setOld\w*Time\(epochTime\)\s*\n\s*setHasMore\w*\(false\)/)
  })

  it("gives the list its name, each row's summary, whose sends are the reader's, and Try again", () => {
    const src = read(messages)
    for (const prop of ["label=", "rowLabel={rowLabel}", "isOwn={isOwn}", "retryOlder={retryOlder}"]) expect(src).toContain(prop)
    expect(src).toMatch(/messageSummary\(\{ from: m\.\w+_(by|from), at: m\.\w+_created_at, html: m\.\w+, files: m\.\w+_attachments\?\.length \}\)/)
  })
})
