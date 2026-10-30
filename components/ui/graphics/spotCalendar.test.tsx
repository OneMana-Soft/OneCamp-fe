import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { HUE_CLASS } from "./hues"
import { SpotCalendar } from "./spots"
import { areaHue } from "@/lib/areas"

// DESIGN-BUILD-5, 22 Oct: the calendar's empty week, month and agenda drew
// their spot in berry, calls' hue, because the spot's default was berry and
// the calendar's own callers pass none. A spot left to its default is in its
// area's hue, as the inbox's, the tasks' and the docs' are.
describe("the calendar spot", () => {
  it("is in the calendar's hue unless it is given one", () => {
    expect(renderToStaticMarkup(<SpotCalendar />)).toContain(`class="${HUE_CLASS[areaHue("calendar")]}"`)
    expect(renderToStaticMarkup(<SpotCalendar hue="moss" />)).toContain(`class="${HUE_CLASS.moss}"`)
  })
})
