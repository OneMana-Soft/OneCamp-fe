"use client"

import * as React from "react"
import { copyLook, documentPip, pipKind, type PipKind, type PipSize } from "@/lib/pip/pipWindow"

export type PipWindow = {
  /** Which picture-in-picture this browser has (null until it's known, and on the server). */
  kind: PipKind
  /** The open window, or null. */
  win: Window | null
  /** Opens the window (from a person's tap or click), drawn once it's dressed, or gives the one already open; null where there's none to give, or it closed before it was dressed. */
  open: (size?: PipSize) => Promise<Window | null>
  /** The <video> in its own picture-in-picture now (the "video" kind's), or null. */
  video: HTMLVideoElement | null
  /** Pops a <video> out into its own picture-in-picture (from a tap or click); false when the browser won't. */
  openVideo: (video: HTMLVideoElement) => Promise<boolean>
  /** Closes the window, and takes back a video this surface popped out. */
  close: () => void
}

// The browser's kind never changes while the page lives: nothing to subscribe to.
const unchanging = () => () => {}
const noKindOnServer = (): PipKind => null

// Which video is in picture-in-picture: the browser says when that changes,
// with events that bubble from the video.
function watchVideo(change: () => void): () => void {
  document.addEventListener("enterpictureinpicture", change, true)
  document.addEventListener("leavepictureinpicture", change, true)
  return () => {
    document.removeEventListener("enterpictureinpicture", change, true)
    document.removeEventListener("leavepictureinpicture", change, true)
  }
}
const videoNow = (): HTMLVideoElement | null => {
  const out = document.pictureInPictureElement
  return out instanceof HTMLVideoElement ? out : null
}
const noVideoOnServer = (): HTMLVideoElement | null => null

/**
 * Picture-in-picture for any surface. A Document Picture-in-Picture window
 * dressed like the app (copyLook), and drawn only once it is: it forgets the window when the person
 * closes it, and closes it when asked or when the surface that opened it goes
 * away, so a window never outlives its call. Where the browser has only a
 * video's own picture-in-picture (Safari), it pops a <video> out instead and
 * takes back only the one it popped.
 */
export function usePipWindow(): PipWindow {
  const kind = React.useSyncExternalStore(unchanging, () => pipKind(), noKindOnServer)
  const video = React.useSyncExternalStore(watchVideo, videoNow, noVideoOnServer)
  const [win, setWin] = React.useState<Window | null>(null)
  const open$ = React.useRef<{ win: Window; stopLook: () => void } | null>(null)
  const popped$ = React.useRef<HTMLVideoElement | null>(null)

  const forget = React.useCallback(() => {
    open$.current?.stopLook()
    open$.current = null
    setWin(null)
  }, [])

  const close = React.useCallback(() => {
    const was = open$.current?.win
    forget()
    was?.close()
    const popped = popped$.current
    popped$.current = null
    if (popped && document.pictureInPictureElement === popped) void document.exitPictureInPicture().catch(() => {})
  }, [forget])

  const open = React.useCallback(
    async (size?: PipSize) => {
      const api = documentPip()
      if (!api) return null
      if (open$.current) return open$.current.win
      const opened = await api.requestWindow(size)
      const look = copyLook(document, opened.document)
      open$.current = { win: opened, stopLook: look.stop }
      // The browser fires pagehide on the window when the person closes it.
      opened.addEventListener("pagehide", () => open$.current?.win === opened && forget(), { once: true })
      // Drawn only once it's dressed, so no one sees it in the browser's own look.
      await look.ready
      // Closed meanwhile (by the person, by close, or with the call): never drawn.
      if (open$.current?.win !== opened) return null
      setWin(opened)
      return opened
    },
    [forget],
  )

  const openVideo = React.useCallback(async (target: HTMLVideoElement) => {
    try {
      await target.requestPictureInPicture()
    } catch {
      return false
    }
    popped$.current = target
    return true
  }, [])

  React.useEffect(() => close, [close])

  return { kind, win, video, open, openVideo, close }
}
