import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@/lib/testing/sourceFiles"

// A page reads what it shows as it opens, before the topics it hears are live:
// what was sent in between reached it neither way, and it stayed stale until a
// reload (F5, REGRESSION-HUNT 26 Oct 2026). So each useMqttTopic caller names
// what it reads again when its topic goes live (onLive), or says here why it
// has nothing to read.
const NOTHING_TO_READ: Record<string, string> = {
  "components/table/presence/TablePresence.tsx": "who is here now: everyone's next heartbeat says it again",
}

/** Each useMqttTopic(…) call in `src`, as written. */
function calls(src: string): string[] {
  const out: string[] = []
  for (let at = src.indexOf("useMqttTopic("); at >= 0; at = src.indexOf("useMqttTopic(", at + 1)) {
    let end = at + "useMqttTopic".length
    let depth = 0
    do {
      if (src[end] === "(") depth++
      else if (src[end] === ")") depth--
      end++
    } while (depth > 0 && end < src.length)
    out.push(src.slice(at, end))
  }
  return out
}

describe("a page that hears a topic", () => {
  const files = sourceFiles(["app", "components", "hooks", "lib"], /\.tsx?$/)

  it("reads again what it shows when the topic goes live", () => {
    const forgot = files
      .filter((file) => !(file in NOTHING_TO_READ))
      .flatMap((file) => calls(readFileSync(file, "utf8")).filter((call) => !/\bonLive\b/.test(call)).map((call) => `${file}: ${call}`))
    expect(forgot).toEqual([])
  })

  it("names here only files that still hear a topic", () => {
    for (const file of Object.keys(NOTHING_TO_READ)) expect(calls(readFileSync(file, "utf8")), file).not.toEqual([])
  })
})
