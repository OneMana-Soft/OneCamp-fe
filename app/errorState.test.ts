import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
/**
 * On a list surface, the failure branch must be checked BEFORE the empty branch.
 *
 * This is an ordering bug, not a missing-feature bug, and ordering is exactly the
 * kind of thing that gets quietly reversed by a later edit. SWR leaves `data`
 * undefined when a request fails, so `items.length === 0` is true on failure as
 * well as on a genuinely empty list. Whichever branch is tested first wins. Put
 * the empty check first and the app tells a user with a hundred tables that they
 * have none — and offers no retry, because as far as the page knows nothing went
 * wrong.
 *
 * So this asserts the order in source for the surfaces that were fixed. It is
 * intentionally a small, named list rather than a codebase-wide rule: plenty of
 * components legitimately have no error branch (an inline widget, a count, a
 * surface whose parent already reports the failure), and a blanket rule would
 * either be wrong or be disabled.
 */
const root = resolve(__dirname, "..")
/**
 * Surfaces where a blank list is indistinguishable from a failure, and where the
 * empty copy makes a claim about the user's own work.
 */
const SURFACES = [
  // Pages.
  "app/app/tables/page.tsx",
  "app/app/templates/page.tsx",
  "app/app/board/page.tsx",
  "app/app/posts/page.tsx",
  "app/app/recordings/page.tsx",
  // The user's own primary work. The empty copy on these asserts the work does
  // not exist, which is the most alarming reading of a failed request.
  "components/myTask/myTaskList.tsx",
  "components/project/ProjectList.tsx",
  "components/team/TeamList.tsx",
  "components/channel/channelListTabActive.tsx",
  "components/chat/chatUserList.tsx",
  // Activity. The empty copy here says nothing needs the user, which is the one
  // conclusion they must not reach from a request that merely failed.
  "components/activity/activityAllListResult.tsx",
  "components/activity/activityMentionListResult.tsx",
  "components/activity/activityCommentListResult.tsx",
  "components/activity/activityReactionListResult.tsx",
  // Comments. "Be the first to add a comment" invites a reply to a thread that
  // may already hold a discussion, which the user then talks over.
  "components/rightPanel/docCommentList.tsx",
  "components/rightPanel/docMobileCommentList.tsx",
  "components/rightPanel/taskInfoPanel.tsx",
  // Secondary user content.
  "components/channel/channelListTabArchive.tsx",
  "components/team/TeamListTabProject.tsx",
  "components/project/projectAttachmentList.tsx",
  "components/channel/channelRecording.tsx",
  "components/chat/ChatRecording.tsx",
  "components/chat/GroupChatRecording.tsx",
  "components/task/GitHubActivityTab.tsx",
  // Admin. Lower stakes than a member's own work, but the claim is still false —
  // and GitHubIntegrationCard's was actively misleading: isConnected is
  // `status?.connected || false`, so a failed status fetch read as "not
  // connected" and offered a Connect button that starts a redundant OAuth flow.
  "components/admin/ApiTokensCard.tsx",
  "components/admin/DataSourcesCard.tsx",
  "components/admin/WebhooksCard.tsx",
  "components/admin/SlackImportCard.tsx",
  "components/admin/GitHubIntegrationCard.tsx",
]
/**
 * Strips comments before any structural analysis.
 *
 * Not a nicety: the first version of the guard below was defeated by the
 * explanatory comment written beside the fix. TeamList's comment contains the
 * literal "!isError" while explaining why !isError is needed, so deleting the
 * real guard left the test still matching — on prose. A test that can be
 * satisfied by a comment is worse than no test, because it reports success.
 */
function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ") // {/* jsx */}
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* block */
    .replace(/^\s*\/\/.*$/gm, " ") // whole-line //
    .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1") // trailing //
}
describe("failed list fetches are not shown as empty", () => {
  it.each(SURFACES)("%s reports the failure and offers a retry", (rel) => {
    const src = readFileSync(resolve(root, rel), "utf8")
    expect(src, "must read isError from the fetch hook").toMatch(/isError/)
    expect(src, "must render the shared ErrorState").toMatch(/<ErrorState/)
    // The retry must go through SWR's mutate for the key the surface is already
    // bound to — a retry built any other way could disagree with the cache. The
    // identifier is what is checked, not the call shape, because aliasing it
    // (`mutate: refetch`) is legitimate and SlackImportCard does exactly that.
    expect(src, "must offer a retry").toMatch(/onRetry=/)
    expect(src, "the retry must revalidate via SWR's mutate").toMatch(/\bmutate\b/)
  })

  /**
   * Surfaces whose empty state is driven by a DIFFERENT source than the fetch
   * being guarded, so excluding the error from it would be wrong.
   */
  const ORDERING_EXEMPT: Record<string, string> = {
    // Its only empty state is search-scoped ("No conversations match"), driven by
    // the search results rather than the chat-list fetch. A search with no matches
    // is genuinely empty whether or not the list fetch failed.
    "components/chat/chatUserList.tsx":
      "empty state belongs to the search results, not the guarded fetch",
  }

  it.each(SURFACES)("%s cannot render its empty state on a failure", (rel) => {
    if (ORDERING_EXEMPT[rel]) return
    const src = stripComments(readFileSync(resolve(root, rel), "utf8"))

    // EVERY empty state, not just the first. An earlier version checked only the
    // first occurrence, which under-covered files with more than one: removing the
    // !isError guard from GitHubIntegrationCard's "GitHub not connected" block
    // left the suite green, because the "No repositories linked" block above it
    // still carried a guard and was the only one examined.
    const sites = [...src.matchAll(/<(EmptyState|StatePlaceholder)\b/g)].map((m) => m.index!)
    if (sites.length === 0) return

    for (const at of sites) {
      const before = src.slice(0, at)

      // Only two things actually make an empty state unreachable on a failure, and
      // the distinction matters more than it looks:
      //
      //   exclusive   `isError ? … :` and `if (isError) return` — the empty branch
      //               is genuinely not evaluated.
      //   NOT         `{isError && …}` as a SIBLING block. The error renders, and
      //               then the empty block renders too, because nothing stopped it.
      //
      // An earlier version accepted "isError appears before the empty state", which
      // the sibling shape satisfies while still being broken; it passed when the
      // guard was deleted from TeamList. So a sibling block has to carry !isError
      // on the empty condition, and that is checked explicitly.
      const exclusiveChain = /\bisError\b[^?\n]*\?/.test(before)
      const earlyReturn = /if\s*\(\s*[\w.]*\bisError\b/.test(before)
      // Scoped to the enclosing JSX expression rather than the whole prefix, so a
      // guard on an EARLIER block cannot vouch for this one.
      const enclosing = before.slice(before.lastIndexOf("{"))
      const guardedEmpty = /!\s*[\w.]*\bisError\b/.test(enclosing)

      // A search-scoped empty state is exempt, and this is a real distinction
      // rather than a convenience: "no teams match your search" is true whether or
      // not a background fetch failed, and its emptiness is a property of the query.
      // Requiring !isError there would suppress a correct message.
      //
      // POLARITY is what separates the two, not the mere presence of the word.
      // A search block renders when a search IS active (`searchText && …`); the main
      // empty block mentions the same variable in order to EXCLUDE it
      // (`!searchText && …`). Matching on the identifier alone exempted TeamList's
      // main block and let a real regression through.
      const searchPositive = /(^|[^!\w.])[\w.]*[Ss]earch\w*\s*&&/.test(enclosing)
      if (searchPositive) continue

      expect(
        exclusiveChain || earlyReturn || guardedEmpty,
        `${rel}: an empty state at offset ${at} can still render while the fetch ` +
          "has failed, so a failed request gets reported to the user as 'you have " +
          "nothing here'. Use `isError ? … :`, an early return, or add !isError to " +
          "that block's own condition — an `{isError && …}` sibling block is not " +
          "enough on its own, because the empty block still renders after it.",
      ).toBe(true)
    }
  })
})
