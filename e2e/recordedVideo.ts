import type { Page, Route } from "@playwright/test"

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

/**
 * A route that serves `body` as the store serves a file (the app's media
 * address is a MinIO presigned GET, which answers a Range request with a 206):
 * a range gets just that slice. Chromium seeks only in a file its server sends
 * by ranges; sent whole with a 200, its seekable range stays empty and a seek
 * snaps back to 0.
 */
export const servedInRanges = (body: Buffer, contentType: string) => (route: Route) => {
  const headers = { "accept-ranges": "bytes" }
  const range = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers()["range"] ?? "")
  if (!range || (!range[1] && !range[2])) return route.fulfill({ status: 200, contentType, headers, body })
  const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1
  if (start > end) return route.fulfill({ status: 416, headers: { ...headers, "content-range": `bytes */${body.length}` } })
  return route.fulfill({
    status: 206,
    contentType,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${body.length}` },
    body: body.subarray(start, end + 1),
  })
}
