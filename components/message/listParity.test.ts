import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Channels, DMs and groups had three copies of one list until the one model
// replaced them (PROGRAM CH1, chat A1 step 2b): the paged list
// (hooks/useConversation) and its rows (components/conversation). What A0
// gave the list stays in it.
const read = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8")

describe("the conversation's list", () => {
  it("pages back from the latest page's has_more, keeps it on a failure, and offers Try again", () => {
    const hook = read("hooks/useConversation.ts")
    expect(hook).toMatch(/useOlderPages\(\{\s*latestHasMore: adapter\.hasMoreOf\(latest\.data\),/)
    expect(hook).toContain("retry: retryOlder")
    // "Has more" is never turned off as a page is asked for: only an answer does.
    expect(hook).not.toMatch(/setOlderFrom\([^)]*\)\s*\n\s*setHasOlder\(false\)/)
    expect(read("components/conversation/ConversationRows.tsx")).toContain("retryOlder={older.retry}")
  })

  it("gives the list its name, each row's summary, whose sends are the reader's, and Try again", () => {
    const src = read("components/conversation/ConversationRows.tsx")
    for (const prop of ["label={label}", "rowLabel={rowLabel}", "isOwn={isOwn}", "retryOlder={older.retry}"]) expect(src).toContain(prop)
    expect(src).toMatch(/messageSummary\(\{ from: m\.from, at: m\.createdAt, html: m\.bodyText, files: m\.attachments\?\.length \}\)/)
  })
})
