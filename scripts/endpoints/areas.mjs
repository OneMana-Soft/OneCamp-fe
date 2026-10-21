// The app's feature areas, by file path: which area a file's code belongs to.
// services/endPoints.ts holds only what two or more areas (or the shell) use;
// an endpoint one area uses lives in services/endpoints/<area>.ts, so a route
// loads only its own area's (platform P-SPEED, 18 Oct 2026). The split
// (release-1011/tools/endpoints-split) and the guard (app/endpointsShared.test.ts)
// read areas from here, so they never disagree.
//
// The first rule whose pattern matches a file's path names its area. A file
// no rule names is the shell's: what it uses stays shared.

import { reach } from "../fluidity/reach.mjs"

const rule = (area, ...patterns) => patterns.map((p) => [area, p])

// Shared containers (dialogs, drawers, pickers, the mobile bars) hold one
// feature's pieces each: their file's name says whose.
const SHARED_DIRS = String.raw`^components\/(dialog|drawers|combobox|navigationBar|fileUpload|rightPanel|onboarding|common)\/(?:.*\/)?`
const named = (area, words) => [area, new RegExp(SHARED_DIRS + String.raw`[^/]*(` + words + String.raw`)[^/]*\.(t|j)sx?$`, "i")]

export const AREA_RULES = [
  named("chat", "Channel|Chat|Message|Conversation|Forward"),
  named("docs", "Doc"),
  named("boards", "Board"),
  named("projects", "Project|Task|Invoice"),
  named("people", "Team|User|Profile|Member"),
  // Boards: the whiteboards.
  ...rule("boards", /^components\/board\//, /^app\/app\/board\//, /^lib\/board(\/|\.)/),
  // Calls: the room, recordings, transcripts.
  ...rule("calls", /^components\/(livekit|callIndicator|recording)\//, /^app\/app\/(meet|recordings)\//, /^lib\/calls\//, /^services\/(callService|transcriptService)\./, /\/(call|meet|recording|transcript)[A-Z]?[^/]*\.(t|j)sx?$/i),
  // Calendar: events, booking, focus time.
  ...rule("calendar", /^components\/(calendar|booking)\//, /^app\/(app\/calendar|book|booking|rsvp)\//, /^lib\/calendar\//, /^hooks\/use(Calendar|FocusTime|StartFocus)/, /^services\/(bookingService|eventInvitationService)\./, /\/(event|calendar|booking)[A-Z][^/]*\.(t|j)sx?$/),
  // Tables.
  ...rule("tables", /^components\/table\//, /^app\/app\/tables\//, /^lib\/(tables|csv)\b/, /^services\/(tableService|tableRows)\b/),
  // Docs: the editor, the tree, comments, live entities.
  ...rule("docs", /^components\/(doc|docEditor|docTree|docComments|docTemplates|minimal-tiptap|entityLink|liveEntity)\//, /^app\/app\/doc\//, /^lib\/(doc[A-Za-z]*|docs|docComments|codec|anchors|embeds|liveEntity|export)(\/|\.)/, /^hooks\/useDoc/, /^services\/(doc[A-Za-z]*|entityLinkService|followService|connectedService)\./),
  // Projects and tasks.
  ...rule("projects", /^components\/(task|project|kanbanComponents|myTask|goals|projectUpdates|projectTemplates|reports|tags|fields|views|time|proposals|checkins)\//, /^app\/app\/(project|task|myTask|goals|templates)\//, /^app\/invoice\//, /^lib\/(task|tasks|bulkTasks|goals|goalPercent|projectsOverview|projectUpdates|projectTemplates|projectHue|reports|workload|workloadKey|timeline|timelineKey|taskStatus|rates|checkins|work)(\/|\.)/, /^hooks\/use(Task|Project|BulkTask|MoveTask|AssignedTasks|ArchiveProject|Goals|Workload|CheckIns)/, /^hooks\/deleteTasksUndo/, /^services\/(workAccessService|taskExtractService|proposalService)\./, /\/(task|project)[A-Z][^/]*\.(t|j)sx?$/),
  // AI and agents.
  ...rule("ai", /^components\/ai\//, /^app\/app\/ai\//, /^lib\/ai\//, /^services\/(ai[A-Za-z]*|agent[A-Za-z]*|scheduleService|memoryService|answerRecovery|nudgeService|pendingAction[A-Za-z]*|governanceDrillService|runProvenance)\./),
  // Admin and settings.
  ...rule("admin", /^components\/(admin|marketplace|connectors)\//, /^app\/(app\/admin|admin-setup)\//, /^app\/app\/settings\//, /^services\/(apiTokenService|appService|marketplaceService|mcpService|scimTokenService|slackImportService|slackBridgeService|importService|invitationService|connectorService|dataSourceService|workflowService|twoFactorService|aiModelService|systemCheckService|updatesService|dataSubjectService|auditCategories)\./),
  // Search.
  ...rule("search", /^components\/(search|searchDropdown)\//, /^app\/app\/search\//, /^hooks\/useSearch/, /^services\/searchService\./, /^lib\/search\//),
  // Inbox, activity and later.
  ...rule("inbox", /^components\/(activity|inbox|notifications|Notification|later)\//, /^app\/app\/(inbox|later)\//, /^hooks\/use(Activity|Later|PauseNotifications|NotificationLevel)/, /^services\/(activityService|inboxService|laterService|catchUpService)\./, /^lib\/(activity|notifications)\//),
  // People and teams.
  ...rule("people", /^components\/(team|member|profile|invite|guest)\//, /^app\/app\/(team|profile|user)\//, /^app\/guest\//, /^hooks\/useUserAvatar/, /^services\/guestService\./),
  // Chat: channels, DMs, groups, messages, threads.
  ...rule("chat", /^components\/(channel|chat|groupChat|message|messages|mobileChatMessage|mobileMessage|mobilePost|conversation|threads|textInput|typingIndicator|reactionPicker|posts|clips|command)\//, /^app\/app\/(channel|chat|forward|posts)\//, /^hooks\/use(Chat|Channel|Conversation|PostMessage|Message|JoinChannel|PublishTyping|ScheduledMessages|EarlierHistory|DeleteMessage|SaveEdit)/, /^lib\/(chat|conversation|messages|messageGrouping)(\/|\.)/, /^services\/(channelService|channelUnread|channelRestore|unreadCache|commandService|pollService|unfurlService|channelReportService)\./, /\/(channel|chat|message|thread|dm|groupChat)[A-Z][^/]*\.(t|j)sx?$/),
  // Home.
  ...rule("home", /^components\/home\//, /^app\/app\/home\//),
]

/** The area a file's path says it belongs to, or "shell" when no rule names one. */
export function areaByPath(file) {
  for (const [area, re] of AREA_RULES) if (re.test(file)) return area
  return "shell"
}

/**
 * The files every signed-in page loads: what the root and the app's layouts
 * reach by static import (scripts/fluidity/reach.mjs). An endpoint one of them
 * uses is on every route anyway, so it is shared, whatever area its file is.
 */
export async function shellFiles(root = ".") {
  const here = process.cwd()
  process.chdir(root)
  try {
    return new Set([...reach(["app/layout.tsx", "app/app/layout.tsx"]).keys()])
  } finally {
    process.chdir(here)
  }
}

/** The area a file belongs to: "shell" when the layouts load it, else by its path. */
export function areaOf(file, shell = new Set()) {
  return shell.has(file) ? "shell" : areaByPath(file)
}
