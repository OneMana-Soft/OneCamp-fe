import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * A test that writes a date sets the clock it reads by.
 *
 * A fixed date in a test meets today wherever the code under test reads the
 * time, and the test passes only until the calendar moves past it. The booking
 * page's test failed on every gate from 11:30 IST on 14 Oct 2026: its meeting
 * was "tomorrow" when it was written (manageBooking.test.tsx, whose other tests
 * set the clock, but not that one). "19 Sep" gains its year on 1 January; a
 * cycle's "4 d left" ends with the cycle. So in a test file that writes a date
 * of this century, every test runs on a clock it set: vi.setSystemTime, or
 * vi.useFakeTimers with now, in a beforeEach or beforeAll over the test, in the
 * test, or in a function of the file that the test calls. The usual way is the
 * one pin, pinTestClock() from lib/testing/testClock, in the file or in a
 * describe: today is 15 Oct 2026, 12:00 UTC (TEST_TODAY), or the day given.
 *
 * Files that wrote dates before this rule are counted below, by the dates they
 * write. Each passed with today moved three years on and 400 days back (15 Oct
 * 2026), so its dates never meet the clock: the code is given the time to read
 * them by, or never reads them against today. The counts may only go down, and
 * a file that sets its clock leaves the list. A new date in one of them, or a
 * test anywhere else on the machine's clock, fails.
 */

const BASELINE: Record<string, number> = {
  "app/app/settings/profile/profilePage.test.tsx": 3,
  "app/book/[slug]/bookingPage.test.tsx": 3,
  "app/clockTimes.test.ts": 1,
  "components/activity/activityCard.test.tsx": 3,
  "components/activity/activityEchoes.test.tsx": 11,
  "components/activity/activityItemAnatomy.test.tsx": 2,
  "components/activity/activityTabsFrame.test.tsx": 5,
  "components/admin/AgentInventoryCard.test.tsx": 1,
  "components/admin/addAdminDialog.test.tsx": 1,
  "components/admin/adminAuditLog.test.tsx": 2,
  "components/admin/adminInvitationList.test.tsx": 2,
  "components/admin/agentEvalBadge.test.ts": 1,
  "components/admin/agentGitHubEvents.test.tsx": 2,
  "components/admin/agentLearningSection.test.tsx": 1,
  "components/admin/agentRemoteCheck.test.tsx": 2,
  "components/admin/agentRunRemoteWork.test.tsx": 1,
  "components/admin/agentRunResultChart.test.tsx": 1,
  "components/admin/agentRunsTimeline.test.tsx": 2,
  "components/admin/ai/overviewTab.test.ts": 5,
  "components/admin/apiTokens.test.tsx": 4,
  "components/admin/archiveRestoreDialog.test.tsx": 2,
  "components/admin/auditLogRows.test.tsx": 8,
  "components/admin/auditNobodyWatching.test.tsx": 1,
  "components/admin/evidencePackView.test.tsx": 3,
  "components/admin/evidenceReceipts.test.tsx": 6,
  "components/admin/gitHubIntegrationCard.test.tsx": 1,
  "components/admin/governanceDrillSequence.test.tsx": 1,
  "components/admin/guestAccessCard.test.tsx": 1,
  "components/admin/importCopy.test.tsx": 3,
  "components/admin/importErrorsDialog.test.tsx": 1,
  "components/admin/integrationsConnectionCards.test.tsx": 1,
  "components/admin/integrationsFrame.test.tsx": 1,
  "components/admin/invitationCard.test.tsx": 2,
  "components/admin/membersList.test.tsx": 2,
  "components/admin/peopleFrame.test.tsx": 1,
  "components/admin/skillLibraryDialog.test.tsx": 2,
  "components/admin/slackBridgeCard.test.tsx": 1,
  "components/admin/slackImportCard.test.tsx": 3,
  "components/admin/slackImportErrorsDialog.test.tsx": 1,
  "components/admin/slackImportJobActions.test.tsx": 1,
  "components/admin/updatesCard.test.tsx": 4,
  "components/admin/webhooksCard.test.tsx": 3,
  "components/admin/webhooksRow.test.tsx": 4,
  "components/ai/AgentWorkRow.test.tsx": 1,
  "components/ai/DocAiActivityDialog.test.tsx": 2,
  "components/ai/DocAiAgentEdits.test.tsx": 4,
  "components/ai/DocAiTasks.test.tsx": 1,
  "components/ai/MyAssistantsCard.test.tsx": 1,
  "components/ai/agentRecord.test.ts": 4,
  "components/ai/aiPanelFrame.test.tsx": 2,
  "components/ai/attentionToNeeds.test.ts": 2,
  "components/ai/chatHistoryMenu.test.tsx": 4,
  "components/ai/inboxNudges.test.tsx": 1,
  "components/ai/myAIActivityFeed.test.tsx": 2,
  "components/ai/scheduleNote.test.tsx": 2,
  "components/ai/suggestions.test.ts": 1,
  "components/calendar/dstWeek.test.tsx": 4,
  "components/calendar/googleAllDay.test.tsx": 33,
  "components/calendar/nowLine.test.tsx": 1,
  "components/calendar/quickCreateGuests.test.tsx": 2,
  "components/calendar/weekView.test.tsx": 4,
  "components/channel/channelLinkMode.test.tsx": 7,
  "components/channel/channelListRelayed.test.tsx": 1,
  "components/channel/details/channelDetails.test.tsx": 1,
  "components/channel/details/channelRestore.test.tsx": 2,
  "components/chat/SeenReceiptLine.test.tsx": 14,
  "components/checkins/channelCheckIns.test.tsx": 1,
  "components/connect/ConnectAuthorize.test.tsx": 1,
  "components/connectors/connectorsCard.test.tsx": 2,
  "components/dialog/attachmentLightbox.test.tsx": 2,
  "components/dialog/createProjectDialog.test.tsx": 2,
  "components/doc/ImportDocDialog.test.tsx": 1,
  "components/doc/restoreRow.test.tsx": 2,
  "components/docComments/CommentsOverlay.test.tsx": 2,
  "components/docComments/threadView.test.ts": 14,
  "components/docEditor/OwnerControl.test.tsx": 1,
  "components/docEditor/ThreadGutter.test.tsx": 3,
  "components/docEditor/history/versions.test.ts": 17,
  "components/docTemplates/templatePicker.test.tsx": 2,
  "components/drawers/longPressSheet.test.tsx": 1,
  "components/goals/goals.test.tsx": 2,
  "components/guest/guestChannelPage.test.tsx": 1,
  "components/guest/guestDocComments.test.tsx": 1,
  "components/guest/guestHue.test.tsx": 1,
  "components/guest/guestLinkSection.test.tsx": 3,
  "components/guest/guestPieces.test.tsx": 1,
  "components/guest/guestProjectPage.test.tsx": 5,
  "components/guest/guestTableChips.test.tsx": 2,
  "components/guest/guestUpdates.test.tsx": 2,
  "components/guest/guestWhen.test.ts": 1,
  "components/guest/verdictChip.test.tsx": 1,
  "components/home/attentionRows.test.tsx": 6,
  "components/home/greetingComposition.test.tsx": 1,
  "components/kanbanComponents/cardAnatomy.test.tsx": 1,
  "components/later/laterPage.test.tsx": 1,
  "components/livekit/callFixes.test.ts": 2,
  "components/message/continuedGutter.test.tsx": 4,
  "components/message/continuedRow.test.tsx": 1,
  "components/message/conversationStart.test.tsx": 1,
  "components/message/forwardDeleted.test.tsx": 4,
  "components/message/liveChangesStay.test.tsx": 3,
  "components/message/messageActions.test.tsx": 2,
  "components/message/messageEdit.test.tsx": 1,
  "components/message/messagePreview.test.tsx": 2,
  "components/message/phoneCheckin.test.tsx": 2,
  "components/message/rowContainment.test.tsx": 1,
  "components/message/rowV3.test.tsx": 2,
  "components/messages/heldNotificationsBar.test.tsx": 1,
  "components/navigationBar/desktop/sidebarMenus.test.tsx": 1,
  "components/profile/signingIn.test.tsx": 1,
  "components/project/ProjectInvoices.test.tsx": 5,
  "components/project/projectFiles.test.tsx": 4,
  "components/project/timeline/timelineBars.test.tsx": 5,
  "components/projectUpdates/updateComposer.test.tsx": 1,
  "components/proposals/review.test.tsx": 1,
  "components/reports/reportsView.test.tsx": 2,
  "components/rightPanel/docCommentsPanel.test.tsx": 6,
  "components/rightPanel/eventInfoPanel.test.tsx": 10,
  "components/rightPanel/replyRenders.test.tsx": 1,
  "components/rightPanel/taskLabelNoWipe.test.tsx": 1,
  "components/rightPanel/threadDrafts.test.tsx": 4,
  "components/rightPanel/threadLoadFailed.test.tsx": 2,
  "components/rightPanel/threadRoot.test.tsx": 4,
  "components/rightPanel/useThreadReplies.test.tsx": 5,
  "components/table/DataTableGrid.test.tsx": 1,
  "components/table/boardCard.test.ts": 1,
  "components/table/formulaColumn.test.tsx": 1,
  "components/table/tableCalendar.test.tsx": 1,
  "components/task/cycleBurndown.test.tsx": 3,
  "components/task/datesRow.test.tsx": 2,
  "components/task/dueLabel.test.tsx": 1,
  "components/task/groupedList.test.tsx": 2,
  "components/task/taskActivity.test.tsx": 16,
  "components/task/taskCompleteCelebrates.test.tsx": 1,
  "components/task/workReducedMotion.test.tsx": 1,
  "components/textInput/composerLabels.test.tsx": 2,
  "components/textInput/composerShell.test.tsx": 3,
  "components/threads/useThreads.test.tsx": 11,
  "components/ui/commandPalette.test.tsx": 1,
  "components/ui/dateTimePicker.test.tsx": 2,
  "components/views/docRender.test.tsx": 2,
  "components/views/firstMessageCelebrates.test.tsx": 1,
  "components/views/unsentMessage.test.tsx": 2,
  "hooks/useCalendarRange.test.tsx": 4,
  "hooks/useChatMessageHandlers.test.ts": 1,
  "hooks/useLinkTarget.test.tsx": 1,
  "hooks/useStartFocus.test.ts": 3,
  "hooks/useTaskUpdate.test.tsx": 1,
  "lib/activity/activityHref.test.ts": 1,
  "lib/activity/feedPages.test.ts": 10,
  "lib/activity/notice.test.ts": 6,
  "lib/activity/notification.test.ts": 20,
  "lib/calendar/allDay.test.ts": 29,
  "lib/calendar/availability.test.ts": 22,
  "lib/calendar/bookedMeeting.test.ts": 2,
  "lib/calendar/parseEventText.test.ts": 9,
  "lib/chat/pageEdge.test.ts": 6,
  "lib/chat/pendingSend.test.ts": 14,
  "lib/chat/readReceipts.test.ts": 1,
  "lib/chat/threadReplies.test.ts": 6,
  "lib/checkins.test.ts": 1,
  "lib/clips/clip.test.ts": 1,
  "lib/docMeta/bus.test.ts": 1,
  "lib/focusTime.test.ts": 1,
  "lib/goals.test.ts": 13,
  "lib/hub/motion.test.ts": 1,
  "lib/invoice/saved.test.ts": 8,
  "lib/messageGrouping.test.ts": 1,
  "lib/notifications/pause.test.ts": 6,
  "lib/projectUpdates.test.ts": 1,
  "lib/projectsOverview.test.ts": 3,
  "lib/reports.flow.test.ts": 4,
  "lib/reports.test.ts": 3,
  "lib/tables/viewRules.test.ts": 5,
  "lib/task/emailToTask.test.ts": 3,
  "lib/tasks/dependency.test.ts": 1,
  "lib/tasks/fields.test.ts": 1,
  "lib/tasks/time.test.ts": 7,
  "lib/timeOff.test.ts": 1,
  "lib/utils/agentWork.test.ts": 6,
  "lib/utils/calendarAgenda.test.ts": 19,
  "lib/utils/date/dayAndTime.test.ts": 5,
  "lib/utils/date/shortDate.test.ts": 10,
  "lib/utils/dueLabel.test.ts": 1,
  "lib/utils/later.test.ts": 5,
  "lib/utils/projectGlance.test.ts": 2,
  "lib/utils/relativeTime.test.ts": 1,
  "lib/utils/timeInStatus.test.ts": 1,
  "services/docAccessService.test.ts": 2,
  "services/inboxService.test.ts": 6,
  "services/publicApi.test.ts": 1,
  "services/runProvenance.test.ts": 1,
  "services/scimTokenService.test.ts": 5,
  "services/slackBridgeService.test.ts": 1,
  "services/updatesService.test.ts": 1,
  "store/slice/messageMerge.test.ts": 74,
  "store/slice/threadsSlice.test.ts": 33,
}

const ROOT = process.cwd()
const SELF = "app/testClock.test.ts"

function testFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "e2e" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) testFiles(p, out)
    else if (/\.test\.tsx?$/.test(e.name)) out.push(relative(ROOT, p))
  }
  return out
}

const ISO = /^20\d\d-(0\d|1[0-2])-[0-3]\d(?:[T ][\d:.]+)?(?:Z|[+-]\d\d:?\d\d)?$/
const isDateCall = (n: ts.Node): n is ts.NewExpression | ts.CallExpression =>
  (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Date") ||
  (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "Date" && ["UTC", "parse"].includes(n.expression.name.text))

/** A date of this century written into the source: an ISO string, or a year or a time in milliseconds given to Date. */
function isFixedDate(n: ts.Node): boolean {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return ISO.test(n.text)
  if (isDateCall(n)) {
    const first = n.arguments?.[0]
    if (!first || !ts.isNumericLiteral(first)) return false
    const v = Number(first.text)
    return (v >= 2000 && v < 2100) || (v >= 1.5e12 && v < 2e12)
  }
  return false
}

const isVi = (e: ts.Expression, name: string) => ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "vi" && e.name.text === name

/** A call that sets the clock: vi.setSystemTime(…), or vi.useFakeTimers({ now }). */
function setsClock(n: ts.Node): boolean {
  if (!ts.isCallExpression(n)) return false
  if (isVi(n.expression, "setSystemTime")) return true
  const options = n.arguments[0]
  return isVi(n.expression, "useFakeTimers") && !!options && ts.isObjectLiteralExpression(options) && options.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "now")
}

/** What a call's name starts with: `it` for it(…), it.only(…) and it.each(…)(…). */
function rootName(e: ts.Expression): string | null {
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e) || ts.isCallExpression(e)) return rootName(e.expression)
  return null
}

const lastFunction = (call: ts.CallExpression) => [...call.arguments].reverse().find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a)) as ts.ArrowFunction | ts.FunctionExpression | undefined

/** Where a call sits: the body of the describe(…) it is in, or the file. */
function scopeOf(n: ts.Node, sf: ts.SourceFile): ts.Node {
  for (let p = n.parent; p; p = p.parent) {
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isCallExpression(p.parent) && rootName(p.parent.expression) === "describe") return p
  }
  return sf
}

/** The names a file imports the one pin, lib/testing/testClock's pinTestClock, under. */
function pinNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !/(^|\/)lib\/testing\/testClock$|^\.\/testClock$/.test(st.moduleSpecifier.text)) continue
    const bound = st.importClause?.namedBindings
    if (!bound || !ts.isNamedImports(bound)) continue
    for (const el of bound.elements) if ((el.propertyName ?? el.name).text === "pinTestClock") names.add(el.name.text)
  }
  return names
}

/** The dates a test file writes, and the tests in it that run on the machine's clock (by name). */
export function clockOf(src: string, fileName = "x.test.tsx"): { dates: number; unset: string[] } {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const pin = pinNames(sf)
  let dates = 0
  const fns = new Map<string, ts.Node>()
  const tests: ts.CallExpression[] = []
  const hooks: ts.CallExpression[] = []
  const calls: ts.ExpressionStatement[] = []
  ts.forEachChild(sf, function visit(n) {
    if (isFixedDate(n)) dates++
    if (ts.isFunctionDeclaration(n) && n.name && n.body) fns.set(n.name.text, n.body)
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) fns.set(n.name.text, n.initializer.body)
    if (ts.isCallExpression(n)) {
      const name = rootName(n.expression)
      if ((name === "it" || name === "test") && lastFunction(n)) tests.push(n)
      else if ((name === "beforeEach" || name === "beforeAll") && lastFunction(n)) hooks.push(n)
    }
    // A statement run as a file or a describe is read, such as vi.setSystemTime(…).
    if (ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && !["it", "test", "describe", "beforeEach", "beforeAll", "afterEach", "afterAll"].includes(rootName(n.expression.expression) ?? "")) calls.push(n)
    ts.forEachChild(n, visit)
  })
  if (!dates) return { dates, unset: [] }

  // The file's functions that set the clock, themselves or through another.
  const pins = new Set<string>()
  const calledHere = (n: ts.Node, names: Set<string>) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text)
  const reaches = (n: ts.Node): boolean =>
    setsClock(n) || calledHere(n, pin) || calledHere(n, pins) || !!ts.forEachChild(n, (c) => reaches(c) || undefined)
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, body] of fns) {
      if (pins.has(name) || !reaches(body)) continue
      pins.add(name)
      grew = true
    }
  }
  // The file and the describes whose tests all run on a clock they set.
  const setScopes = new Set<ts.Node>()
  for (const h of hooks) if (reaches(lastFunction(h)!)) setScopes.add(scopeOf(h, sf))
  for (const c of calls) {
    const owner = scopeOf(c, sf)
    const direct = c.parent === sf || (owner !== sf && c.parent === (owner as ts.ArrowFunction).body)
    if (direct && reaches(c)) setScopes.add(owner)
  }
  const unset: string[] = []
  for (const t of tests) {
    let set = reaches(lastFunction(t)!)
    for (let s: ts.Node = scopeOf(t, sf); !set; s = scopeOf(s, sf)) {
      set = setScopes.has(s)
      if (s === sf) break
    }
    if (!set) unset.push(t.arguments[0] && ts.isStringLiteralLike(t.arguments[0]) ? t.arguments[0].text : "(a test)")
  }
  return { dates, unset }
}

describe("a test that writes a date", () => {
  const files = testFiles(ROOT).filter((f) => f !== SELF)
  const read = new Map(files.map((f) => [f, clockOf(readFileSync(f, "utf8"), f)]))

  it("sets the clock it reads by", () => {
    const found: string[] = []
    for (const [file, { dates, unset }] of read) {
      if (!unset.length) continue
      const allowed = BASELINE[file]
      if (allowed === undefined) found.push(...unset.map((t) => `${file}: "${t}"`))
      else if (dates > allowed) found.push(`${file}: ${dates} dates (allowed ${allowed}): set its clock instead`)
    }
    expect(found, `pin the clock with pinTestClock() from @/lib/testing/testClock, in the file or a describe (or set it in the test):\n${found.join("\n")}`).toEqual([])
  })

  it("leaves the counts above to files that still write their dates on the machine's clock", () => {
    const stale = Object.entries(BASELINE).flatMap(([file, allowed]) => {
      const now = read.get(file)
      if (!now || !now.unset.length) return [`${file}: gone, or it sets its clock now: take it off the list`]
      return now.dates < allowed ? [`${file}: ${now.dates} dates now: lower its count`] : []
    })
    expect(stale).toEqual([])
  })
})

describe("the clock a test reads by", () => {
  it("is the machine's unless something sets it", () => {
    expect(clockOf(`it("says when", () => { expect(when("2026-10-14")).toBe("14 Oct") })`)).toEqual({ dates: 1, unset: ["says when"] })
    expect(clockOf(`it("adds", () => { expect(add(1, 2)).toBe(3) })`)).toEqual({ dates: 0, unset: [] })
  })

  it("is set by a hook over the test, by the test, or by a function of the file it calls", () => {
    const hook = `beforeEach(() => { vi.setSystemTime(new Date(2026, 9, 15)) })\ndescribe("x", () => { it("a", () => {}) })`
    const own = `const at = "2026-10-13T08:00:00Z"\nit("a", () => { vi.useFakeTimers({ toFake: ["Date"], now: at }) })`
    const helper = `const at = "2026-10-13T08:00:00Z"\nfunction show() { open() }\nfunction open() { vi.setSystemTime(at) }\nit("a", () => { show() })`
    for (const src of [hook, own, helper]) expect(clockOf(src).unset).toEqual([])
  })

  it("is set by the one pin, in the file or in a describe over the test, under any name it is imported as", () => {
    const file = `import { pinTestClock } from "@/lib/testing/testClock"\npinTestClock()\nit("a", () => { when("2026-10-14") })`
    const inDescribe = `import { pinTestClock as pin } from "@/lib/testing/testClock"\ndescribe("d", () => { pin(new Date(2026, 9, 14)); it("a", () => { when("2026-10-14") }) })\nit("b", () => { when("2026-10-14") })`
    expect(clockOf(file).unset).toEqual([])
    expect(clockOf(inDescribe).unset).toEqual(["b"])
    // A function of the same name from anywhere else sets nothing.
    expect(clockOf(`import { pinTestClock } from "./elsewhere"\npinTestClock()\nit("a", () => { when("2026-10-14") })`).unset).toEqual(["a"])
  })

  it("finds the test its file's helper left out, as the booking page's was (14 Oct 2026)", () => {
    const src = `
      const meeting = { start: "2026-10-14T05:30:00Z" }
      async function show() { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-13T08:00:00Z")); render() }
      describe("a booking's own page", () => {
        it("cancels it", async () => { await show() })
        it("asks before cancelling", async () => { render() })
      })`
    expect(clockOf(src).unset).toEqual(["asks before cancelling"])
  })
})
