import { describe, expect, it } from "vitest"
import { isTimeout, waitsAsLongAsItTakes } from "./requestTimeout"
import { GetEndpointUrl, PostEndpointUrl, PostFileUploadURL } from "@/services/endPoints"
import { DocGraphEndpoint } from "@/services/docGraphService"
import { AiPost } from "@/services/endpoints/ai"
import { BoardsPost } from "@/services/endpoints/boards"
import { ChatGet, ChatPost } from "@/services/endpoints/chat"
import { InboxPost } from "@/services/endpoints/inbox"
import { TablesPost } from "@/services/endpoints/tables"

/**
 * Every area's endpoint enums (services/endpoints/<area>.ts, split from
 * services/endPoints.ts so a route loads only its own area's): each module's
 * objects of names to paths.
 */
const AREA_ENUMS = Object.values(import.meta.glob("/services/endpoints/*.ts", { eager: true }) as Record<string, Record<string, unknown>>).flatMap((m) =>
  Object.values(m).filter((v): v is Record<string, string> => typeof v === "object" && v !== null && Object.values(v).every((x) => typeof x === "string")),
)

// FE-F-10: the API client had no timeout, so a stalled send said "Sending…"
// for minutes. It has one now, and this is what it never applies to.
describe("what waits as long as its work takes", () => {
  it("never a message being sent, an edit or a read", () => {
    for (const url of [PostEndpointUrl.CreateChannelPost, PostEndpointUrl.CreateChatMessage, PostEndpointUrl.CreateGroupChatMessage, `${GetEndpointUrl.GetChannelLatestPost}/c1`, GetEndpointUrl.SelfProfileSideNav, "/task/updateTaskName"]) {
      expect(waitsAsLongAsItTakes({ url, data: { text: "hi" } }), url).toBe(false)
    }
  })

  it("a file going up or coming down, whatever its route", () => {
    expect(waitsAsLongAsItTakes({ url: PostFileUploadURL.UploadFile, data: new FormData() })).toBe(true)
    expect(waitsAsLongAsItTakes({ url: "/po/createPost", data: new Blob(["x"]) })).toBe(true)
    expect(waitsAsLongAsItTakes({ url: "/project/time", responseType: "blob" })).toBe(true)
    expect(waitsAsLongAsItTakes({ url: "/doc/x", onUploadProgress: () => {} })).toBe(true)
  })

  it("the model at work, wherever its route lives", () => {
    for (const url of [
      InboxPost.AICatchUp,
      AiPost.AISchedulePropose,
      "/admin/ai/self-test",
      BoardsPost.GenerateBoardDiagramStream,
      "/tables/t1/fields/f1/ai-fill",
      "/tables/t1/query-plan",
      TablesPost.GenerateTable,
      AiPost.DraftAgent,
      ChatGet.GetDMAISuggestions,
    ]) {
      expect(waitsAsLongAsItTakes({ url }), url).toBe(true)
    }
  })

  it("imports, exports, restores and checks of another service", () => {
    for (const url of ["/admin/import/jobs/j1/run", "/admin/github/import-issues/l1", "/admin/auditLog/export?from=1", ChatPost.RestoreChannel, "/data-sources/test-connection", "/agents/agui/check"]) {
      expect(waitsAsLongAsItTakes({ url }), url).toBe(true)
    }
  })

  // An archive run's undo restores the whole run, however big: cut at 30 s,
  // it left part of the run deleted (REGRESSION-AUDIT R3, 23 Oct 2026).
  it("an archive run's undo, which is a write", () => {
    expect(waitsAsLongAsItTakes({ url: `${PostEndpointUrl.UndoArchiveJob}/j1`, method: "post" })).toBe(true)
    expect(waitsAsLongAsItTakes({ url: `${PostEndpointUrl.UndoArchiveJob}/j1`, method: "get" })).toBe(false)
  })

  // A duplicate fills up to 200 copies and a purge forgets up to 5,000 pages:
  // cut at 30 s, a second Duplicate made the copies again.
  it("a duplicate and a purge of a doc tree, and nothing else of the docs", () => {
    for (const url of [DocGraphEndpoint.Duplicate, DocGraphEndpoint.Purge]) {
      expect(waitsAsLongAsItTakes({ url, method: "post" }), url).toBe(true)
    }
    for (const url of [DocGraphEndpoint.Delete, DocGraphEndpoint.Move, DocGraphEndpoint.Children]) {
      expect(waitsAsLongAsItTakes({ url, method: "post" }), url).toBe(false)
    }
  })

  // The server answers these when the work ends: an agent's run (the
  // builder's Run), its evaluation, one scenario's, the admin's governance
  // drill and a mail thread's summary all run the model before they answer,
  // and were cut off at 30 seconds with "didn't answer in time".
  it("a run or a summary the server answers when it ends, but never a read", () => {
    for (const url of [`${AiPost.RunAgent}/a1/run`, `${GetEndpointUrl.GetAgents}/a1/eval/run`, `${GetEndpointUrl.GetAgents}/eval/scenarios/s1/run`, "/admin/governance-drill/run", "/connectors/gmail/threads/t1/summary"]) {
      expect(waitsAsLongAsItTakes({ url, method: "post" }), url).toBe(true)
    }
    for (const url of [`${GetEndpointUrl.GetAgents}/a1/runs`, `${GetEndpointUrl.GetAgents}/a1/eval/summary`, `${GetEndpointUrl.GetAgents}/eval/summary`]) {
      expect(waitsAsLongAsItTakes({ url, method: "get" }), url).toBe(false)
    }
  })

  // A route the model, an import, an export or a restore answers, added
  // later, is never cut short: every endpoint named for one is matched. A
  // value several names share is a prefix the caller builds on (its
  // comment says what it appends), so it's left out.
  it("covers every endpoint named for the model, an import, an export or a restore", () => {
    const named = /(^AI|^Ai|AI[A-Z]|Generate|Draft|Import|Export|Restore|Transcribe|Summarize|Translate|Analyze|CatchUp|ExtractTasks|QueryPlan)/
    // The shared enums and every area's.
    const entries = [GetEndpointUrl, PostEndpointUrl, PostFileUploadURL, ...AREA_ENUMS].flatMap((e) => Object.entries(e) as [string, string][])
    const uses = new Map<string, number>()
    for (const [, url] of entries) uses.set(url, (uses.get(url) ?? 0) + 1)
    const missed = entries.filter(([name, url]) => named.test(name) && uses.get(url) === 1 && !waitsAsLongAsItTakes({ url })).map(([name, url]) => `${name} = ${url}`)
    expect(missed).toEqual([])
    expect(entries.filter(([name, url]) => named.test(name) && uses.get(url) === 1).length).toBeGreaterThan(30)
  })
})

describe("a request that ran out of time", () => {
  it("is told apart from one that got no answer for another reason", () => {
    expect(isTimeout({ code: "ECONNABORTED" })).toBe(true)
    expect(isTimeout({ code: "ETIMEDOUT" })).toBe(true)
    expect(isTimeout({ code: "ERR_NETWORK" })).toBe(false)
    expect(isTimeout(undefined)).toBe(false)
  })
})
