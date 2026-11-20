import { expect, test, type BrowserContextOptions } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, note } from "../scripts/fluidity/fakeBoard.mjs"

// miro-33: a board's link with a role, a password and an end, for its guest.
// A password link asks for its password and says each refusal in the server's
// words; a comment link asks the guest's name before the board opens, then
// comments through the server with its live token (who they are is the
// token's, "Guest: <name>", never what the page sends); a view link has no
// comment box. The owner's side (the card, change, 409) is the unit tests'.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f9"
const NAME = boardDocName(BOARD)
const TOKEN = "guest-link-pw"
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
const LIVE = `${b64({ alg: "HS256" })}.${b64({ sub: "guest-g9", name: "Guest: Priya", guest: true })}.sig`

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const session = (capability: string) => ({ collab_token: LIVE, document_name: NAME, resource_type: "board", resource_id: BOARD, capability, title: "Kickoff", workspace_name: "Acme", unlock: "u-1" })

for (const [device, use] of Object.entries(DEVICES)) {
  test(`a password comment link: its refusals, the guest's name, a comment as the link's guest, on a ${device}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const update = boardDoc([...note("n1", 0, 0, "Ship the pricing page")])
    const collab = collabFor([{ id: NAME, update, levels: { [LIVE]: "view" } }])
    const context = await browser.newContext(use)
    const asked: Array<Record<string, unknown>> = []
    const comments: Array<{ auth: string | null; body: Record<string, unknown> }> = []
    let tries = 0
    await fakeApp(context, {
      app: String(test.info().project.use.baseURL),
      user: USERS.vic,
      docs: [],
      collab,
      fixtures: [
        [new RegExp(`/guest/collab/${TOKEN}$`), (_p: string, _u: URL, req: { postDataJSON(): Record<string, unknown> }) => {
          const body = req.postDataJSON() ?? {}
          asked.push(body)
          if (body.unlock === "u-1") return { msg: "ok", data: session("comment") }
          if (!body.password) return status(401, { msg: "This link needs its password.", status: "password_needed" })
          if (body.password === "open-sesame") return { msg: "ok", data: session("comment") }
          tries++
          return tries > 1 ? status(429, { msg: "Too many tries. Wait a few minutes and try again.", status: "rate_limited" }) : status(401, { msg: "That password doesn't open this link.", status: "wrong_password" })
        }],
        [/\/guest\/board-comment$/, (_p: string, _u: URL, req: { headers(): Record<string, string>; postDataJSON(): Record<string, unknown> }) => {
          comments.push({ auth: req.headers().authorization ?? null, body: req.postDataJSON() })
          return { msg: "Success", data: { comment: { id: "c-1" } } }
        }],
      ],
    })
    const page = await context.newPage()
    await page.goto(`/guest/b/${TOKEN}`)
    await expect(page.getByText("This link needs its password.")).toBeVisible()
    const field = page.getByLabel("Password", { exact: true })
    await field.fill("not-it")
    await page.getByRole("button", { name: "Open the board" }).click()
    await expect(page.getByText("That password doesn't open this link.")).toBeVisible()
    await page.getByRole("button", { name: "Open the board" }).click()
    await expect(page.getByText("Too many tries. Wait a few minutes and try again.")).toBeVisible()
    await field.fill("open-sesame")
    await page.getByRole("button", { name: "Open the board" }).click()
    // The name before the board opens; then the board, as a commenter.
    const name = page.getByLabel("Your name, as the team will see it")
    await expect(name).toBeVisible()
    await name.fill("Priya")
    await page.getByRole("button", { name: "Continue" }).click()
    await expect(page.locator("[data-link-role=comment]")).toBeVisible()
    await expect(page.locator("[data-guest-board]")).toBeVisible()
    expect(asked.some((b) => b.password === "open-sesame")).toBe(true)
    expect(asked.at(-1)).toMatchObject({ display_name: "Priya", unlock: "u-1" })
    // A comment goes through the server with the live token, and names no author.
    await page.getByRole("button", { name: "Comment", exact: true }).click()
    const canvas = page.locator("[data-guest-board] canvas").last()
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3)
    // On a computer the new comment is a box by the pin; on a phone, a sheet.
    const box2 = page.getByRole(device === "phone" ? "dialog" : "group", { name: "New comment" })
    // A guest mentions no one, so their box says nothing of mentions.
    await expect(box2.getByRole("textbox")).toHaveAttribute("placeholder", "Add a comment…")
    await box2.getByRole("textbox").fill("Looks good")
    await box2.getByRole("button", { name: "Comment", exact: true }).click()
    await expect.poll(() => comments.length).toBe(1)
    expect(comments[0].auth).toBe(`Bearer ${LIVE}`)
    expect(comments[0].body).toMatchObject({ board_id: BOARD, action: "add", text: "Looks good" })
    expect(Object.keys(comments[0].body)).not.toContain("author")
    await context.close()
  })

  test(`a view link opens with no comment box and asks no name, on a ${device}`, async ({ browser }) => {
    test.setTimeout(60_000)
    const update = boardDoc([...note("n1", 0, 0, "Ship the pricing page")])
    const collab = collabFor([{ id: NAME, update, levels: { [LIVE]: "view" } }])
    const context = await browser.newContext(use)
    await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab, fixtures: [[/\/guest\/collab\/view-link$/, { msg: "ok", data: { ...session("view"), unlock: "" } }]] })
    const page = await context.newPage()
    await page.goto("/guest/b/view-link")
    await expect(page.locator("[data-link-role=view]")).toHaveText(/Can view/)
    await expect(page.locator("[data-guest-board]")).toBeVisible()
    await expect(page.getByLabel("Your name, as the team will see it")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Comment", exact: true })).toHaveCount(0)
    if (device === "phone" && process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/guest-view-link-390.png` })
    await context.close()
  })
}
