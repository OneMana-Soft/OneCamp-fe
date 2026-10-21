import { describe, expect, it } from "vitest"
import { collapseLineRuns, type RunCandidate } from "./lineRuns"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 9, min)).toISOString()
const line = (id: string, kind: string, text: string, min: number): RunCandidate => ({
  id, at: at(min), text: `<p>${text}</p>`, system: JSON.stringify({ kind, actor: id }),
})

describe("a run of joins and leaves (B28)", () => {
  it("is one line at its first, naming up to three and counting the rest", () => {
    const runs = collapseLineRuns([
      line("a", "channel.joined", "Maya joined.", 0),
      line("b", "channel.joined", "Jonas joined.", 4),
      line("c", "channel.left", "Sam left.", 9),
      line("d", "channel.joined", "Ada joined.", 15),
      line("e", "channel.joined", "Priya joined.", 20),
      line("f", "channel.joined", "Lee joined.", 24),
    ])
    expect(runs.words.get("a")).toBe("<p>Maya, Jonas, Ada and 2 others joined. Sam left.</p>")
    expect([...runs.hidden].sort()).toEqual(["b", "c", "d", "e", "f"])
  })

  it("breaks at a gap of more than ten minutes, at a message, and at any other line", () => {
    const runs = collapseLineRuns([
      line("a", "channel.joined", "Maya joined.", 0),
      line("b", "channel.joined", "Jonas joined.", 11),
      { id: "m", at: at(12), text: "<p>hi</p>" },
      line("c", "channel.joined", "Sam joined.", 13),
      line("d", "channel.renamed", "Sam renamed the channel to #x.", 14),
      line("e", "channel.joined", "Ada joined.", 15),
    ])
    expect(runs.hidden.size).toBe(0)
    expect(runs.words.size).toBe(0)
  })

  it("names two as a pair", () => {
    const runs = collapseLineRuns([line("a", "channel.left", "Maya left.", 0), line("b", "channel.left", "Jonas left.", 1)])
    expect(runs.words.get("a")).toBe("<p>Maya and Jonas left.</p>")
  })
})
