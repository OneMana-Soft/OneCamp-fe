import type { Page } from "@playwright/test"

/**
 * A real video for a player to play, made in the page: a canvas `width` x
 * `height` with a bar moving across it, recorded by the browser's
 * MediaRecorder as WebM (Chromium's), its bytes handed back to serve from a
 * route. Its picture's shape is the canvas's, as a call's recording takes its
 * room's (LiveKit's egress: 16:9). Frames are counted, not timed, so a fixed
 * clock (page.clock.setFixedTime) doesn't hold it up.
 */
export async function recordedVideo(page: Page, width: number, height: number, frames = 20): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ({ width, height, frames }) => {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const pen = canvas.getContext("2d")!
      const recorder = new MediaRecorder(canvas.captureStream(25), { mimeType: "video/webm" })
      const parts: Blob[] = []
      recorder.ondataavailable = (e) => parts.push(e.data)
      const stopped = new Promise((done) => (recorder.onstop = done))
      recorder.start()
      for (let i = 0; i < frames; i++) {
        pen.fillStyle = "#1f2937"
        pen.fillRect(0, 0, width, height)
        pen.fillStyle = "#38bdf8"
        pen.fillRect((i / frames) * width, 0, width / 10, height)
        await new Promise((next) => setTimeout(next, 40))
      }
      recorder.stop()
      await stopped
      return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()))
    },
    { width, height, frames },
  )
  return Buffer.from(bytes)
}
