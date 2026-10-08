import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// The kinds the server would answer for an agent and the Check-in bot.
const KINDS: Record<string, string> = { captain: "agent", checkin: "checkin" }
vi.mock("@/hooks/useBotKinds", () => ({
  useBotKind: (uuid: string | undefined, isBot: boolean | undefined) => (isBot && uuid ? KINDS[uuid] : undefined),
}))
const { BotTag } = await import("@/components/ui/botTag")

// Every bot was tagged "Agent" (a screen reader said "AI agent") wherever it
// posted: the Check-in, Slack and guest relays, and on the AI-free edition the
// automation account. Only the assistant and agents have an AI behind them.
describe("BotTag", () => {
  afterEach(cleanup)

  it("tags an agent as an agent", () => {
    const { container } = render(<BotTag userUUID="captain" />)
    expect(container.querySelector(".sr-only")?.textContent).toBe("AI agent")
  })

  it("tags the Check-in bot, and a bot not known yet, as a plain bot", () => {
    for (const id of ["checkin", "unknown"]) {
      const { container } = render(<BotTag userUUID={id} />)
      expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("Bot")
      cleanup()
    }
  })
})

// A bot's name is tagged through BotTag, and its line through botSubtitle, so
// no surface maps "is a bot" straight to AI wording again. The AI teammates
// list (channelAITeammates) lists only AI, so it may say so outright.
const REPO_ROOT = join(__dirname, "..", "..")

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!["node_modules", ".next"].includes(entry.name)) sourceFiles(full, acc)
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

describe("bots are described by their kind", () => {
  const files = ["app", "components", "lib"].flatMap((d) => sourceFiles(join(REPO_ROOT, d)))

  it("tags AI outright only where only AI is listed", () => {
    const offenders = files
      .filter((f) => !f.endsWith("components/member/channelAITeammates.tsx") && /<PrincipalTag\s+kind="ai"/.test(readFileSync(f, "utf8")))
      .map((f) => relative(REPO_ROOT, f))
    expect(offenders, "use <BotTag userUUID={…} /> for a bot's name").toEqual([])
  })

  it("calls a bot an AI teammate only through botSubtitle", () => {
    const offenders = files
      .filter((f) => !f.endsWith("lib/botCopy.ts") && /["'>]\s*AI teammate\s*["'<]/.test(readFileSync(f, "utf8")))
      .map((f) => relative(REPO_ROOT, f))
    expect(offenders, "use botSubtitle(useBotKind(uuid, isBot))").toEqual([])
  })
})
