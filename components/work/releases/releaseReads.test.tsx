import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import { releaseStage } from "./ReleaseBurndown"
import { useKeptRead } from "./releaseParts"

pinTestClock()

// Two of the releases tab's own reads (jira-04 Head B; CR-B68 T1): where a
// release stands in a burndown's terms, and the kept read a write's answer
// is kept in, so the next reader of its path shows it at once.

afterEach(cleanup)

describe("releaseStage", () => {
  const now = new Date("2026-11-11T12:00:00Z")

  it("is completed for a release that's out, its target day past or not", () => {
    expect(releaseStage({ state: "released", target_date: "2026-11-01" }, now)).toBe("completed")
    expect(releaseStage({ state: "released", target_date: null }, now)).toBe("completed")
  })

  it("is ended for a planned release past its target day", () => {
    expect(releaseStage({ state: "planned", target_date: "2026-11-10" }, now)).toBe("ended")
  })

  it("is current for a planned release with no target day, or one not yet past", () => {
    expect(releaseStage({ state: "planned", target_date: null }, now)).toBe("current")
    expect(releaseStage({ state: "planned", target_date: "2026-11-11" }, now)).toBe("current")
    expect(releaseStage({ state: "planned", target_date: "2026-11-20" }, now)).toBe("current")
  })
})

describe("useKeptRead", () => {
  let keep: (got: { v: string }) => void = () => {}
  function Reader({ load }: { load: () => Promise<{ v: string }> }) {
    const read = useKeptRead("/test/releases/kept", load)
    keep = read.keep
    return <p>{read.data ? read.data.v : "nothing yet"}</p>
  }

  it("keeps a write's answer for its path: a reader drawn again shows it before its own read answers", async () => {
    render(<Reader load={async () => ({ v: "before the change" })} />)
    expect(await screen.findByText("before the change")).toBeTruthy()
    act(() => keep({ v: "after the change" }))
    expect(screen.getByText("after the change")).toBeTruthy()
    cleanup()
    // Drawn again (the panel reopened), with a read that hasn't answered.
    render(<Reader load={() => new Promise<never>(() => {})} />)
    expect(screen.getByText("after the change")).toBeTruthy()
  })
})
