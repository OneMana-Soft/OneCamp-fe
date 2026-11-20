import { expect, test } from "@playwright/test"
import { USERS, bytes } from "../scripts/fluidity/fakeApp.mjs"
import { BOARD, GREEN, drawnAnywhere, mapBoard, nodes, openMember, posts, pressAt, wordsOf } from "./mindMapKit"

// The AI edition's mind maps (AI-only: the AI-free line leaves this spec out, lib/editionBoundary.test.ts AI_ONLY):
// an AI mind map lands laid out by the one layout, and Expand with AI grows a node in one change.

const NO_RESULT = "The AI could not produce a result. Try rephrasing."
/** A generated mind map's answer: its root first or not, nodes on one spot. */
const answer = (words: string[], edges: [number, number][]) => ({
  nodes: words.map((label, i) => ({ id: `n${i}`, label, x: 0, y: 0 })),
  edges: edges.map(([from, to]) => ({ from: `n${from}`, to: `n${to}` })),
})

test.describe("mind maps with AI", () => {
  test("an AI mind map lands tagged and laid out by the one mind map layout, not where the server put it", async ({ browser }) => {
    const on = mapBoard([])
    // Every node on one spot: only lib/board/mindMap's layout (the AI panel's import()) spreads them into a map.
    const graph = {
      type: "mindmap",
      nodes: ["Launch", "Site", "Press", "Copy"].map((label, i) => ({ id: `n${i}`, label, shape: "rectangle", x: 0, y: 0, w: 120, h: 50, bgColor: "#FFFFFF" })),
      edges: [{ from: "n0", to: "n1" }, { from: "n0", to: "n2" }, { from: "n1", to: "n3" }],
    }
    const stream = bytes("text/event-stream", `data: ${JSON.stringify({ stage: "layout" })}\n\ndata: ${JSON.stringify({ result: graph })}\n\n`)
    const { context, page } = await openMember(browser, "computer", on, USERS.sam, [[/\/board\/aiGenerateStream$/, () => stream]])
    await page.getByRole("button", { name: "Ask AI" }).click()
    const panel = page.locator("[data-board-ai]")
    await panel.locator("textarea").fill("Plan the launch")
    await panel.getByRole("button", { name: "Generate", exact: true }).click()
    await expect.poll(() => nodes(on).length).toBe(4)
    const all = nodes(on)
    const by = (words: string) => all.find((e) => wordsOf(on, e.id) === words)!
    const [root, site, press, copy] = ["Launch", "Site", "Press", "Copy"].map(by)
    expect(new Set(all.map((e) => e.customData!.mindMap!.map)).size).toBe(1)
    expect(root.customData!.mindMap!.parent).toBeNull()
    expect([site, press].map((e) => e.customData!.mindMap!.parent)).toEqual([root.id, root.id])
    expect(copy.customData!.mindMap!.parent).toBe(site.id)
    // Laid out: Site right of the root, Press on its left, Copy right of Site.
    expect(site.x).toBeGreaterThan(root.x + root.width)
    expect(press.x + press.width).toBeLessThan(root.x)
    expect(copy.x).toBeGreaterThan(site.x + site.width)
    await context.close()
  })

  test("Expand with AI asks once for a node's subtopics and adds the answer's branches under it, laid out; an empty answer adds nothing", async ({ browser }) => {
    const on = mapBoard()
    // CR-421 F1's shape: one branch of the answer has more sub-topics than the root has branches.
    const graph = answer(["Copy", "Headline", "Tagline", "Pricing words", "Short", "Bold", "Clear", "Plain"], [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [1, 6], [1, 7]])
    const ai = posts((_sent, n) => ({ msg: "ok", data: n === 1 ? { nodes: [], edges: [] } : graph }))
    const { context, page } = await openMember(browser, "computer", on, USERS.sam, [[/\/board\/aiGenerate$/, ai.answer]])
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await pressAt(page, "computer", 440, 180)
    const bar = page.locator("[data-mind-map-bar]")
    const expand = page.locator("[data-mind-map-more]").getByRole("button", { name: "Expand with AI" })
    await bar.getByRole("button", { name: "More", exact: true }).click()
    await expand.click()
    await expect(page.getByText(NO_RESULT, { exact: true })).toBeVisible()
    expect(nodes(on)).toHaveLength(4)
    await expand.click()
    await expect(page.getByText("Added 3 ideas", { exact: true })).toBeVisible()
    expect(ai.sent).toHaveLength(2)
    expect(ai.sent[1]).toEqual({ board_uuid: BOARD, prompt: 'Subtopics of "Copy" in a mind map of "Launch"', type: "mindmap" })
    const a1 = nodes(on).find((e) => e.id === "a1")!
    const kids = nodes(on).filter((e) => e.customData!.mindMap!.parent === "a1").sort((p, q) => p.y - q.y)
    expect(kids.map((k) => wordsOf(on, k.id))).toEqual(["Headline", "Tagline", "Pricing words"])
    for (const k of kids) {
      expect(k.customData!.mindMap!.map).toBe("m1")
      expect(k.x).toBeGreaterThan(a1.x + a1.width)
    }
    await context.close()
  })

  test("one Expand with AI is one change: one Undo takes back every idea it added (CR-421 F2)", async ({ browser }) => {
    const on = mapBoard()
    const ai = posts(() => ({ msg: "ok", data: answer(["Copy", "Headline", "Tagline", "Pricing words"], [[0, 1], [0, 2], [0, 3]]) }))
    const { context, page } = await openMember(browser, "computer", on, USERS.sam, [[/\/board\/aiGenerate$/, ai.answer]])
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await pressAt(page, "computer", 440, 180)
    await page.locator("[data-mind-map-bar]").getByRole("button", { name: "More", exact: true }).click()
    await page.locator("[data-mind-map-more]").getByRole("button", { name: "Expand with AI" }).click()
    await expect(page.getByText("Added 3 ideas", { exact: true })).toBeVisible()
    await expect.poll(() => nodes(on).length).toBe(7)
    await page.locator("[data-board-canvas] .excalidraw").focus()
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(() => nodes(on).length).toBe(4)
    await context.close()
  })
})
