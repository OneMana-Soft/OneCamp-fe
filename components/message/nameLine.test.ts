import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A message's name line is 20px whatever sits on it: an "Agent", "Bot",
// "Guest" or "Slack" tag stretched the baseline-aligned line, so those rows
// were 56px among 54px ones.
const ROWS = [
  "components/message/baseMessageCard.tsx",
  // The phone rows of channels, DMs and groups (design v3 chat, C07 phone).
  "components/message/mobileMessageRow.tsx",
  "components/rightPanel/messageContent.tsx",
]
describe("a message's name line", () => {
  it.each(ROWS)("%s holds it at 20px", (f) => {
    const src = readFileSync(join(__dirname, "..", "..", f), "utf8")
    // group/name: the line's author is the keyboard stop that shows its time's tip (TIME_TIP).
    expect(src).toMatch(/data-name-line="" className="(group\/name )?flex h-5 (min-w-0 )?items-center gap-2"/)
  })
})
