import { describe, expect, it } from "vitest"
import { PWA_SNOOZE_MS, pwaPromptKind, type PwaPromptEnv } from "./pwaPrompt"

const base: PwaPromptEnv = { mobile: true, ios: false, standalone: false, demo: false, canPrompt: true, dismissedAt: null, visits: 3, now: 1_000_000_000_000 }

describe("pwaPromptKind", () => {
  it("offers install only when the browser can install", () => {
    expect(pwaPromptKind(base)).toBe("install")
    expect(pwaPromptKind({ ...base, canPrompt: false })).toBeNull()
  })
  it("never claims the app is installed: iOS gets the Add to Home Screen steps", () => {
    expect(pwaPromptKind({ ...base, ios: true, canPrompt: false })).toBe("instructions")
  })
  it("stays out of the demo, desktop, the installed app and a first visit", () => {
    expect(pwaPromptKind({ ...base, demo: true })).toBeNull()
    expect(pwaPromptKind({ ...base, mobile: false })).toBeNull()
    expect(pwaPromptKind({ ...base, standalone: true })).toBeNull()
    expect(pwaPromptKind({ ...base, visits: 1 })).toBeNull()
  })
  it("waits a fortnight after a dismissal", () => {
    expect(pwaPromptKind({ ...base, dismissedAt: base.now - 1000 })).toBeNull()
    expect(pwaPromptKind({ ...base, dismissedAt: base.now - PWA_SNOOZE_MS - 1 })).toBe("install")
  })
})
