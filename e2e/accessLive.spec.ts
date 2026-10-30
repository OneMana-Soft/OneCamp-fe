import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { brokerOn, mqttConfig, stubBackend } from "./stubbedApp"

// A project made, joined or taken away, or a team taken away, reaches an app
// that is already open (lib/mqtt/conversationAccess): the server says so on
// the member's own topic, and the app fetches its realtime settings and its
// sidebar again. Before, a project added while the app was open streamed
// nothing until a reload, and one taken away kept streaming.

test.use({ viewport: { width: 1280, height: 860 } })

const OWN = "user/sam" // the member's own topic, where the access events arrive
const P = "p-launch"
const PROJECT = { project_uuid: P, project_name: "Launch plan" }
const PROJECT_TOPIC = `project/${P}`
const TEAM = { team_uuid: "t-growth", team_name: "Growth" }
// MqttMessageType.Conversation_Access (services/mqttService.ts).
const CONVERSATION_ACCESS = 38

/**
 * The app on Home with a realtime broker of its own, and a server whose
 * answers follow `member`: what the member has now (the sidebar's lists, and
 * the topics the realtime settings name).
 */
async function openWithBroker(page: Page, testInfo: TestInfo, member: { project: boolean; team: boolean }) {
  await stubBackend(page, testInfo, {
    "/config/mqttConfig": () => mqttConfig(member.project ? [OWN, PROJECT_TOPIC] : [OWN]),
    "/user/sidebarNav": () => ({
      msg: "ok",
      data: { user_projects: member.project ? [PROJECT] : [], user_teams: member.team ? [TEAM] : [] },
    }),
  })
  const { broker } = await brokerOn(page)
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect.poll(() => broker.subscriptions(), { timeout: 60_000 }).toContain(OWN)
  return broker
}

const projectLink = (page: Page) => page.locator(`a[href="/app/project/${P}"]`)

test("a project added while the app is open shows in the sidebar, and its topic is heard", async ({ page }, testInfo) => {
  const member = { project: false, team: false }
  const broker = await openWithBroker(page, testInfo, member)
  await expect(projectLink(page)).toHaveCount(0)
  expect(broker.subscriptions()).not.toContain(PROJECT_TOPIC)

  member.project = true
  broker.publish(OWN, { type: CONVERSATION_ACCESS, data: { kind: "project", id: P, change: "added" } })
  await expect(projectLink(page)).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => broker.subscriptions(), { timeout: 15_000 }).toContain(PROJECT_TOPIC)
})

test("a project taken away leaves the sidebar, and its topic is let go", async ({ page }, testInfo) => {
  const member = { project: true, team: false }
  const broker = await openWithBroker(page, testInfo, member)
  await expect(projectLink(page)).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => broker.subscriptions(), { timeout: 15_000 }).toContain(PROJECT_TOPIC)

  member.project = false
  broker.publish(OWN, { type: CONVERSATION_ACCESS, data: { kind: "project", id: P, change: "dropped" } })
  await expect(projectLink(page)).toHaveCount(0, { timeout: 15_000 })
  await expect.poll(() => broker.subscriptions(), { timeout: 15_000 }).not.toContain(PROJECT_TOPIC)
})

test("a team taken away takes its projects with it, from the sidebar and the topics", async ({ page }, testInfo) => {
  const member = { project: true, team: true }
  const broker = await openWithBroker(page, testInfo, member)
  await expect(projectLink(page)).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => broker.subscriptions(), { timeout: 15_000 }).toContain(PROJECT_TOPIC)

  member.team = false
  member.project = false
  broker.publish(OWN, { type: CONVERSATION_ACCESS, data: { kind: "team", id: TEAM.team_uuid, change: "dropped" } })
  await expect(projectLink(page)).toHaveCount(0, { timeout: 15_000 })
  await expect.poll(() => broker.subscriptions(), { timeout: 15_000 }).not.toContain(PROJECT_TOPIC)
})
