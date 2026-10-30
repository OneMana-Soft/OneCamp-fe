import { expect, type Page } from "@playwright/test"

// What the page asks of the camera and microphone, watched from before its
// first script: every getUserMedia it makes, and every track it was given.
// Shared by the green room's specs and the call's (greenRoomPreview,
// callHandOver).

type WatchedWindow = Window & {
  __mediaAsks: string[]
  __tracksGiven: MediaStreamTrack[]
}

/** Every track getUserMedia gave the page, from before its first script: its kind and whether it is still live. */
export async function tracksGiven(page: Page) {
  await page.addInitScript(() => {
    const media = navigator.mediaDevices
    const ask = media.getUserMedia.bind(media)
    const given: MediaStreamTrack[] = []
    Object.assign(window, { __tracksGiven: given })
    media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const stream = await ask(constraints)
      given.push(...stream.getTracks())
      return stream
    }
  })
  return () => page.evaluate(() => (window as unknown as WatchedWindow).__tracksGiven.map((t) => `${t.kind} ${t.readyState}`).sort())
}

/** The device behind the one live camera track the page was given ("" when none is live, or more than one). */
export function liveCamera(page: Page) {
  return page.evaluate(() => {
    const live = (window as unknown as WatchedWindow).__tracksGiven.filter((t) => t.kind === "video" && t.readyState === "live")
    return live.length === 1 ? live[0].label : ""
  })
}

/** Every getUserMedia the page makes, as the kinds it asks for ("audio+video"), from before its first script. */
export async function countAsks(page: Page) {
  await page.addInitScript(() => {
    const media = navigator.mediaDevices
    const ask = media.getUserMedia.bind(media)
    const asks: string[] = []
    Object.assign(window, { __mediaAsks: asks })
    media.getUserMedia = (constraints?: MediaStreamConstraints) => {
      asks.push(["audio", "video"].filter((kind) => !!constraints?.[kind as "audio" | "video"]).join("+"))
      return ask(constraints)
    }
  })
  return () => page.evaluate(() => (window as unknown as WatchedWindow).__mediaAsks)
}

/** The green room's preview has a frame to show (its video's readyState HAVE_CURRENT_DATA or more). */
export async function expectPicture(page: Page) {
  const video = page.locator("[data-preview] video")
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
}
