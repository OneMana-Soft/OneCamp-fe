import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Voice, Video and Screen share one stage: Voice's 112px box against the
// others' 16:9 frame resized the centred dialog on every switch, moving its
// title and the switch itself about 56px.
describe("the clip recorder's stage", () => {
  const src = readFileSync(join(__dirname, "ClipRecorder.tsx"), "utf8")
  it("is one 16:9 frame whatever is recorded", () => {
    expect(src).toMatch(/data-clip-stage="" className="[^"]*\baspect-video\b/)
    expect(src).not.toMatch(/kind === "voice" \? "h-28"/)
  })
  it("keeps two lines for its hint, so a wrapping hint moves nothing", () => {
    expect(src).toMatch(/data-clip-hint="" className=\{cn\("min-h-8/)
  })
})

// Design v3 chat, C56: the recorder on the floating material at e4, 520px; a
// segmented control whose chip slides by transform; the stage r12 on the
// sunken ground; a voice meter of three rings scaled by the level (no pulse);
// a timer chip; a 2px berry line for the room used, drawn by scaleX.
describe("the clip recorder's v3 dress", () => {
  const src = readFileSync(join(__dirname, "ClipRecorder.tsx"), "utf8")
  it("is 520px at e4", () => {
    expect(src).toMatch(/data-clip-dialog="" className="[^"]*shadow-e4[^"]*sm:max-w-\[520px\]/)
  })
  it("slides its chip by transform, never by width or left", () => {
    expect(src).toMatch(/data-clip-chip=""[\s\S]{0,200}transition-transform/)
    expect(src).toMatch(/transform: `translateX\(\$\{at \* 100\}%\)`/)
    expect(src).toMatch(/role="radiogroup"/)
  })
  it("draws the stage r12 on the sunken ground, the meter by scale, the room used by scaleX", () => {
    expect(src).toMatch(/data-clip-stage="" className="[^"]*rounded-xl bg-sunken/)
    expect(src).toMatch(/scale\(calc\(1 \+ var\(--level\)/)
    expect(src).not.toMatch(/animate-pulse/)
    expect(src).toMatch(/data-clip-progress=""[^>]*scaleX\(\$\{progress\}\)/)
    expect(src).toMatch(/data-clip-timer=""[^>]*tabular-nums/)
  })
})

// Opening the recorder puts focus on the dialog, not on its first radio, whose
// focus ring outlined "Voice" in the accent as if it were a second selection.
describe("the clip recorder opening", () => {
  const src = readFileSync(join(__dirname, "ClipRecorder.tsx"), "utf8")
  it("focuses the dialog itself", () => {
    expect(src).toMatch(/onOpenAutoFocus=\{focusDialogItself\}/)
  })
})

