import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"

// The marketing site has a button that says "Run the drill in the demo". It
// used to sign a visitor in and leave them on the home screen, several clicks
// from the drill, with nothing saying where to go. On a page whose argument is
// that the guarantee can be checked in an afternoon, that button proved the
// opposite.
const page = readFileSync("app/page.tsx", "utf8")
const card = readFileSync("components/ai/MyAIActivityCard.tsx", "utf8")

describe("a demo link that asks for the drill", () => {
  it("carries a destination rather than a boolean", () => {
    expect(page).toContain("DEMO_DESTINATIONS")
    expect(page).toMatch(/drill:\s*"\/app\/activity\?tab=ai&run=drill"/)
  })

  it("keeps every link already published working", () => {
    // start_demo=1 is not in the map, so it resolves to undefined and the
    // handler falls back to the home screen. An unknown value must never
    // become a failed redirect.
    expect(page).toMatch(/router\.push\(destination \|\| app_home_path\)/)
  })

  // THE OPEN REDIRECT. The parameter is reachable by anybody who can put a
  // link in front of a visitor, so it selects from paths we wrote rather than
  // naming one.
  it("never redirects to a path taken from the url", () => {
    expect(page).toMatch(/handleDemoLogin\(DEMO_DESTINATIONS\[asked\]\)/)
    expect(page).not.toMatch(/router\.push\((?:asked|params\.get)/)
  })

  // THE WRITE. Landing somewhere is harmless; running the drill is a state
  // change, so the parameter alone must never cause one. status.seeded comes
  // from the server and is true only where the demo fixture exists.
  it("only runs itself where the demo fixture exists", () => {
    expect(card).toMatch(/if\s*\(!status\?\.seeded\)\s*return/)
    const effect = card.slice(card.indexOf("if (autoRan.current"), card.indexOf("}, [status?.seeded"))
    expect(effect).toContain("status?.seeded")
    expect(effect).toContain('params.get("run") !== "drill"')
  })

  it("runs once, and takes the instruction out of the url", () => {
    expect(card).toContain("autoRan.current = true")
    expect(card).toContain('params.delete("run")')
    expect(card).toContain("window.history.replaceState")
  })
})
