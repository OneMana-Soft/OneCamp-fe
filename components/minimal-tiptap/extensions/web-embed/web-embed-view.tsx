"use client"

import * as React from "react"
import { drawnSelected } from "@/components/minimal-tiptap/utils"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { ArrowUpRight, Globe, GripHorizontal, Loader2, WifiOff } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { isSafeHref } from "@/lib/utils/safeHref"
import { embedFor, type Embed } from "@/lib/embeds/providers"
import { LinkField } from "../links-media/LinkField"
import { adminHostsNow } from "../links-media/hosts"
import { ensureAdminHosts } from "../links-media/adminHosts"

const MIN = 120
const MAX = 1600
const STEP = 24

/** Whether the browser says it is online; true where it can't tell. */
function useOnline(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb)
      window.addEventListener("offline", cb)
      return () => {
        window.removeEventListener("online", cb)
        window.removeEventListener("offline", cb)
      }
    },
    () => navigator.onLine !== false,
    () => true,
  )
}

/** The embed a link makes here, the admin's hosts read when a built-in site doesn't make one. */
function useEmbed(src: string): { embed: Embed | null; settled: boolean } {
  const [hosts, setHosts] = React.useState(adminHostsNow)
  const builtIn = src ? embedFor(src, []) : null
  const [settled, setSettled] = React.useState(!!builtIn)
  React.useEffect(() => {
    if (!src || builtIn) return
    let live = true
    void ensureAdminHosts().then((h) => {
      if (!live) return
      setHosts(h)
      setSettled(true)
    })
    return () => {
      live = false
    }
  }, [src, builtIn])
  return { embed: builtIn ?? (src ? embedFor(src, hosts) : null), settled: settled || !!builtIn }
}

/**
 * An embed (editor.md P1-5): the site's own player or viewer, framed from the
 * link someone pasted, never from an address stored in the doc. The frame is
 * sandboxed (no top navigation), sends no referrer beyond what a player needs,
 * and loads when it nears the screen. A link no allowed site makes is shown as
 * a link, with a way to make it a bookmark. Its height is someone's to set
 * (the grip below, or ↑ ↓ on it); a video keeps its shape.
 */
export function WebEmbedView({ node, editor, selected, updateAttributes, getPos }: NodeViewProps) {
  const src = typeof node.attrs.src === "string" ? node.attrs.src : ""
  const { embed, settled } = useEmbed(src)
  const online = useOnline()
  const [loaded, setLoaded] = React.useState(false)
  const [drag, setDrag] = React.useState<number | null>(null)
  const editable = editor.isEditable

  const toBookmark = React.useCallback(
    (href: string) => {
      const pos = typeof getPos === "function" ? getPos() : null
      if (pos == null) return
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, editor.schema.nodes.bookmark, { blockId: node.attrs.blockId, href }))
    },
    [editor, getPos, node.attrs.blockId],
  )

  if (!src) {
    return (
      <NodeViewWrapper data-web-embed="" contentEditable={false} className="select-none">
        {editable ? (
          <LinkField
            label="Paste a link to embed"
            action="Embed"
            selected={selected}
            hint="YouTube, Vimeo, Loom, Figma, Google Docs, Sheets, Slides and Maps, Gists, CodePen, Excalidraw, Miro, Spotify and posts on X, and any site your admin added."
            check={(href) =>
              embedFor(href, adminHostsNow()) ? null : (
                <>
                  That site can&apos;t be shown in a doc.{" "}
                  <button type="button" className="font-medium text-brand-text underline-offset-2 hover:underline" onClick={() => toBookmark(href)}>
                    Make it a bookmark
                  </button>
                </>
              )
            }
            onSubmit={(href) => updateAttributes({ src: href })}
          />
        ) : null}
      </NodeViewWrapper>
    )
  }

  if (!embed) {
    const safe = isSafeHref(src) && /^https?:\/\//i.test(src)
    return (
      <NodeViewWrapper data-web-embed="" contentEditable={false} className="select-none my-1">
        {/* On a phone the button wraps under the words, in line with them. */}
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[12px] bg-sunken px-4 py-3 text-ui-sm", drawnSelected(editor, selected) && "ring-2 ring-brand ring-offset-2 ring-offset-sheet")}>
          {settled ? <Globe className="size-4 shrink-0 text-ink-3" aria-hidden="true" /> : <Loader2 className="size-4 shrink-0 animate-spin text-ink-3 motion-reduce:animate-none" aria-hidden="true" />}
          <span className="min-w-0 flex-1 basis-56 text-ink-2">
            {settled ? "This link can't be shown here." : "Opening the embed…"}{" "}
            {safe ? (
              <a href={src} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand-text underline-offset-2 hover:underline">
                {src}
              </a>
            ) : null}
          </span>
          {settled && editable && safe ? (
            <button type="button" onClick={() => toBookmark(src)} className="h-7 shrink-0 rounded-lg px-2.5 text-ui-sm font-medium text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand max-sm:ml-4.5 max-sm:h-11">
              Make it a bookmark
            </button>
          ) : null}
        </div>
      </NodeViewWrapper>
    )
  }

  const height = drag ?? (typeof node.attrs.height === "number" ? node.attrs.height : embed.height)
  const sized = !embed.aspect || typeof node.attrs.height === "number" || drag !== null
  const box: React.CSSProperties = sized ? { height } : { aspectRatio: String(embed.aspect), maxWidth: embed.maxWidth }

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const top = e.clientY - height
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    let last = height
    const move = (ev: PointerEvent) => {
      last = Math.round(Math.min(MAX, Math.max(MIN, ev.clientY - top)))
      setDrag(last)
    }
    const up = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", up)
      target.removeEventListener("pointercancel", up)
      setDrag(null)
      updateAttributes({ height: last })
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", up)
    target.addEventListener("pointercancel", up)
  }

  return (
    <NodeViewWrapper data-web-embed={embed.provider} contentEditable={false} className="select-none group/embed relative my-1">
      <div
        className={cn("relative mx-auto w-full overflow-hidden rounded-[12px] bg-sunken shadow-e1", drawnSelected(editor, selected) && "ring-2 ring-brand ring-offset-2 ring-offset-sheet")}
        style={box}
      >
        {online ? (
          <iframe
            src={embed.src}
            title={`${embed.name} embed`}
            sandbox={embed.sandbox}
            allow={embed.allow}
            referrerPolicy={embed.referrerPolicy}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={cn("absolute inset-0 size-full border-0", drag !== null && "pointer-events-none")}
          />
        ) : null}
        {!loaded || !online ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-ui-sm text-ink-3">
            {online ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}
            {online ? `Loading ${embed.name}…` : `You're offline. The ${embed.name} embed shows when you're back online.`}
          </div>
        ) : null}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="absolute right-2 top-2 inline-flex h-6 items-center gap-1 rounded-md bg-pop px-2 text-meta font-medium text-ink-2 opacity-0 shadow-e1 outline-none transition-opacity duration-[140ms] hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand group-hover/embed:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {embed.name}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </a>
      </div>
      {editable && sized ? (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={`Height of the ${embed.name} embed`}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={height}
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
            e.preventDefault()
            updateAttributes({ height: Math.min(MAX, Math.max(MIN, height + (e.key === "ArrowDown" ? STEP : -STEP))) })
          }}
          className="mx-auto mt-1 flex h-4 w-16 cursor-ns-resize items-center justify-center rounded-md text-ink-4 opacity-0 outline-none transition-opacity duration-[140ms] hover:text-ink-2 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand group-hover/embed:opacity-100 [@media(hover:none)]:opacity-100 max-sm:hidden"
        >
          <GripHorizontal className="size-4" aria-hidden="true" />
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}
