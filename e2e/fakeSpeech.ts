import type { Page } from "@playwright/test"

// The browser's speech recognition, stood in for. Headless Chromium has no
// speech service: SpeechRecognition.start() ends the page ("Target crashed",
// the Chromium "bad Mojo message" of QA F-21). The stand-in hears nothing; it
// counts the recognisers made, started and stopped, so a spec can see when
// the app's transcriber listens (components/livekit/FrontendTranscriber).

/** How many recognisers were made and started, and how many are listening now. */
export interface SpeechCounts {
  made: number
  starts: number
  stops: number
  live: number
}

/** Installs the stand-in before the page's own scripts run. */
export async function fakeSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counts = { made: 0, starts: 0, stops: 0, live: 0 }
    ;(window as unknown as { __speech: typeof counts }).__speech = counts
    class Recognition {
      continuous = false
      interimResults = false
      lang = ""
      onstart: ((e: Event) => void) | null = null
      onend: ((e: Event) => void) | null = null
      onerror: ((e: Event) => void) | null = null
      onresult: ((e: Event) => void) | null = null
      private listening = false
      constructor() {
        counts.made += 1
      }
      start() {
        if (this.listening) throw new DOMException("recognition has already started", "InvalidStateError")
        this.listening = true
        counts.starts += 1
        counts.live += 1
        queueMicrotask(() => this.onstart?.(new Event("start")))
      }
      stop() {
        this.end()
      }
      abort() {
        this.end()
      }
      addEventListener() {}
      removeEventListener() {}
      private end() {
        if (!this.listening) return
        this.listening = false
        counts.stops += 1
        counts.live -= 1
        queueMicrotask(() => this.onend?.(new Event("end")))
      }
    }
    const w = window as unknown as { SpeechRecognition: unknown; webkitSpeechRecognition: unknown }
    w.SpeechRecognition = Recognition
    w.webkitSpeechRecognition = Recognition
  })
}

/** The stand-in's counts in the page now. */
export function speechCounts(page: Page): Promise<SpeechCounts> {
  return page.evaluate(() => ({ ...(window as unknown as { __speech: SpeechCounts }).__speech }))
}
