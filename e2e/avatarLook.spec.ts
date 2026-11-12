import { mkdirSync } from "node:fs"
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test"

import { JONAS, LAUNCH, MAYA, ME, POST, VIEWS, channel, openChannel } from "./channelPage"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { SAM, appOrigin, logFailures, stubBackend } from "./stubbedApp"

// The avatar (components/ui/avatar) is a shared primitive on every route, plain
// DOM since FLUIDITY-25 (it was Radix's). On a phone (390, touch), light and
// dark, across its callers (chat rows, a channel's members, a task's assignee,
// a call's tile), it draws as it did: a person's initials while their face
// loads and when it fails, the face once it has, filling the same round box.
// What it checks reads the page as a person sees it, never how the avatar is
// built, so it holds on the build before (Radix) as on the one after. With
// AVATAR_SHOTS_DIR set, each avatar is shot before and after its face loads.

test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
})

const PHONE = VIEWS[1]
const SCHEMES = ["light", "dark"] as const
type Scheme = (typeof SCHEMES)[number]

// A face: 1x1, a solid colour, which the avatar's box scales to fill.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")

/** The faces the page asks for, served from the app's origin: held until release(); a "gone" face is a 404. */
async function faces(page: Page) {
  const held: (() => void)[] = []
  let open = false
  await page.route(/\/__faces\//, async (route) => {
    if (route.request().url().includes("gone")) return route.fulfill({ status: 404, body: "" })
    if (!open) await new Promise<void>((go) => held.push(go))
    return route.fulfill({ status: 200, contentType: "image/png", headers: { "cache-control": "max-age=3600" }, body: PNG })
  })
  return () => {
    open = true
    for (const go of held.splice(0)) go()
  }
}
const face = (testInfo: TestInfo, name: string) => new URL(`/__faces/${name}.png`, appOrigin(testInfo)).href

/** The avatar whose initials these are (the first one showing), marked so it can be found again once its initials have gone. */
async function avatarOf(scope: Locator, initials: string, mark: string): Promise<Locator> {
  const fallback = scope.getByText(initials, { exact: true }).first()
  await expect(fallback, `${initials}'s initials show while the face loads`).toBeVisible({ timeout: 60_000 })
  await fallback.evaluate((el, m) => el.parentElement!.setAttribute("data-e2e-face", m), mark)
  return scope.page().locator(`[data-e2e-face="${mark}"]`)
}

/** Round, its face or initials filling it. */
async function expectRoundAndFilled(avatar: Locator, inside: Locator, what: string) {
  const [box, fill] = [await avatar.boundingBox(), await inside.boundingBox()]
  expect(box && box.width >= 16 && Math.abs(box.width - box.height) <= 1, `${what}: a square box (${JSON.stringify(box)})`).toBe(true)
  expect(fill && Math.abs(fill.width - box!.width) <= 1 && Math.abs(fill.height - box!.height) <= 1, `${what} fills it (${JSON.stringify(fill)} in ${JSON.stringify(box)})`).toBe(true)
  const look = await avatar.evaluate((el) => ({ overflow: getComputedStyle(el).overflow, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) }))
  expect(look.overflow, `${what}: clipped to its round box`).toBe("hidden")
  expect(look.radius, `${what}: its corners round`).toBeGreaterThan(4)
}

async function shot(avatar: Locator, name: string) {
  const dir = process.env.AVATAR_SHOTS_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  const box = (await avatar.boundingBox())!
  await avatar.page().screenshot({ path: `${dir}/${name}.png`, clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: box.width + 24, height: box.height + 24 }, animations: "disabled" })
}

/** Initials while the face is held; the face once released; the initials gone. */
async function loadsItsFace(avatar: Locator, initials: string, release: () => void, name: string) {
  await expectRoundAndFilled(avatar, avatar.getByText(initials, { exact: true }), `${name}'s initials`)
  await expect(avatar.locator("img"), `${name}: no face shows before it loads`).toBeHidden()
  await shot(avatar, `${name}-before`)
  release()
  const img = avatar.locator("img")
  await expect(img, `${name}: the face shows once it has loaded`).toBeVisible({ timeout: 30_000 })
  await expect(avatar.getByText(initials, { exact: true }), `${name}: the initials go as the face shows`).toBeHidden()
  await expectRoundAndFilled(avatar, img, `${name}'s face`)
  await shot(avatar, `${name}-after`)
}

async function phoneContext(browser: Browser, testInfo: TestInfo, scheme: Scheme, extra: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: PHONE.viewport, isMobile: true, hasTouch: true, colorScheme: scheme, ...extra })
  const page = await context.newPage()
  logFailures(page)
  return page
}

const P = "9e0a0000-0000-4000-8000-0000000000e2"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }

for (const scheme of SCHEMES) {
  test.describe(`at 390 with touch, ${scheme}`, () => {
    test("a chat row shows its author's initials while the face loads, then the face; a channel's members show it at once, and initials for a face that fails", async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const jonas = { ...JONAS, user_profile_object_key: face(testInfo, "jonas") }
      const maya = { ...MAYA, user_profile_object_key: face(testInfo, "gone-maya") }
      const mayas = { ...POST, post_uuid: "0c4a0000-0000-4000-8000-000000000502", post_text: "<p>Copy is in.</p>", post_by: maya, post_created_at: "2026-10-19T09:40:00Z" }
      let release = () => {}
      const tab = await openChannel(
        browser,
        testInfo,
        PHONE,
        scheme,
        () => ({
          "/user/allUsers": { msg: "ok", users: [ME, maya, jonas] },
          [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [{ ...POST, post_by: jonas }, mayas], has_more: false } },
          [`/ch/channelInfoWithMemberAdminFlag/${LAUNCH}`]: { msg: "ok", channel_info: { ...channel, ch_members: [maya, jonas, ME] } },
          "/user/usersListNotBelongToChannelId": { msg: "ok", users: [] },
          [`/conversations/channel/${LAUNCH}/broadcasts`]: { msg: "ok", data: { members_may: true, own: false, manages: true } },
          "/guest/links": { msg: "ok", data: [] },
        }),
        async (t) => void (release = await faces(t)),
      )
      const posts = tab.locator("[data-message-row]")
      const chat = await avatarOf(posts.filter({ hasText: "Staging is green." }), "JW", `chat-jonas-${scheme}`)
      await loadsItsFace(chat, "JW", release, `chat-row-${scheme}`)
      const failed = await avatarOf(posts.filter({ hasText: "Copy is in." }), "MC", `chat-maya-${scheme}`)
      await expect(failed.locator("img"), "a face that fails leaves the initials, with no broken image").toBeHidden()
      await expectRoundAndFilled(failed, failed.getByText("MC", { exact: true }), "a failed face's initials")
      await shot(failed, `chat-row-failed-${scheme}`)

      await tab.getByRole("button", { name: "Channel options" }).click()
      await tab.getByRole("button", { name: "Details and members" }).click()
      const members = tab.getByRole("region", { name: "Members · 3" })
      await expect(members.getByText("Maya Chen")).toBeVisible({ timeout: 30_000 })
      const listed = members.locator("[data-member-row]").filter({ hasText: "Jonas Weber" }).locator('img[src*="__faces/jonas"]')
      await expect(listed, "a face already loaded shows in the members list").toBeVisible({ timeout: 15_000 })
      const listedBox = listed.locator("xpath=..")
      await expectRoundAndFilled(listedBox, listed, "a member's face")
      await shot(listedBox, `people-list-${scheme}`)
      const mayaRow = members.locator("[data-member-row]").filter({ hasText: "Maya Chen" })
      const mayaFace = await avatarOf(mayaRow, "MC", `people-maya-${scheme}`)
      await expect(mayaFace.locator("img"), "a member whose face fails shows initials").toBeHidden()
      await shot(mayaFace, `people-list-failed-${scheme}`)
      await tab.context().close()
    })

    test("a task row's assignee shows initials while the face loads, then the face", async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const page = await phoneContext(browser, testInfo, scheme)
      const sam = { ...SAM, user_profile_object_key: face(testInfo, "sam") }
      const task = (i: number) => ({
        task_uuid: `00000000-0000-4000-8000-3${String(i).padStart(11, "0")}`, task_name: `Task ${i}`, task_status: "todo", task_priority: "medium", task_label: "", task_due_date: "", task_start_date: "",
        task_rank: (i + 1) * 1024, task_created_at: "2026-10-01T09:00:00Z", task_status_since: "2026-10-01T09:00:00Z", task_deleted_at: "0001-01-01T00:00:00Z", task_sub_task_count: 0, task_comment_count: 0,
        task_assignee: sam, task_project: { project_uuid: P, project_name: "Big launch" }, task_access: { edit: true, delete: true, comment: true, log_time: true },
      })
      const tasks = [task(0), task(1), task(2)]
      const project = { project_uuid: P, project_name: "Big launch", project_is_admin: 1, project_is_member: 1, project_members: [sam], project_access: ADMIN }
      await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
      await stubBackend(page, testInfo, {
        [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: tasks.length, project_tasks: tasks }, pageCount: 1 },
        [`/project/info/${P}`]: { msg: "ok", data: project },
        [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
        [`/project/${P}/statuses`]: { msg: "ok", data: null },
        [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
        [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
        [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
        [`/project/${P}/tags`]: { msg: "ok", data: [] },
        [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
        [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
        [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: true } },
        [`/project/taskListForKanban/${P}`]: {
          msg: "ok",
          data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0 },
        },
        [`/project/${P}/forecast`]: { msg: "ok", data: null },
        "/task/views": { msg: "ok", data: [] },
        "/notices": { msg: "ok", data: [] },
        "/user/dm-ai-targets": { msg: "ok", data: [] },
        "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Big launch" }, topic: `project/${P}` }] },
      })
      const release = await faces(page)
      await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      // A phone's list is its own (components/task/taskListTask): the assignee on a row's second line, 20 px, so one initial.
      const row = page.locator("[data-phone-task-row]").filter({ hasText: "Task 0" })
      await expect(row).toBeVisible({ timeout: 150_000 })
      await loadsItsFace(await avatarOf(row, "S", `task-sam-${scheme}`), "S", release, `task-assignee-${scheme}`)
      await page.context().close()
    })

    test("a call's agent tile draws its mark in the tile's face", async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const CH = "c0ffee00-0000-4000-8000-0000000000cf"
      const you: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
      const captain: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000003a5", name: "Release Captain", agent: true }
      const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
      const page = await phoneContext(browser, testInfo, scheme, { permissions: ["camera", "microphone"] })
      await stubBackend(page, testInfo, {
        "/config/client": { msg: "ok", data: { features: { calls: true } } },
        "/ch/getCallToken": { msg: "ok", data: { token } },
        "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
        "/calls/current": { msg: "ok", data: { live: true, session: { id: "5e550000-0000-4000-8000-0000000000af", people: [] }, you: { role: "participant", can: [] } } },
      })
      const server = await fakeCallServer(page, { you, others: [captain] })
      await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
      await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
      const tile = page.locator(`[data-flip-key="${captain.identity}|camera"]`).first()
      await expect(tile, "the agent's tile").toBeVisible({ timeout: 30_000 })
      const avatar = tile.locator("[data-agent-avatar]")
      const mark = avatar.locator(":scope > span")
      await expect(mark, "the agent's mark shows in its tile").toBeVisible()
      await expect(mark.locator("svg"), "its spark").toBeVisible()
      await expectRoundAndFilled(avatar, mark, "the agent's mark")
      await shot(avatar, `call-agent-tile-${scheme}`)
      await page.context().close()
    })
  })
}
