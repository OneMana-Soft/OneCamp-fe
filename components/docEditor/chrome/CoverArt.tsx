"use client"

import { DocsGet } from "@/services/endpoints/docs"
import type { DocCoverOf } from "@/lib/docLook"
import "./cover.css"

/**
 * A cover's art (B6, D-2): a gallery gradient, or the doc's own image at its
 * offset. Loaded when a doc has a cover, inside the room chrome/look.css keeps
 * for it, so the doc route's first load carries none of the gallery.
 */
export default function CoverArt({ cover, offset }: { cover: NonNullable<DocCoverOf>; offset?: number }) {
  if ("gallery" in cover) return <div className={`doc-cover-art doc-cover-${cover.gallery}`} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the doc's own file, behind its access check
    <img alt="" src={`${process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || ""}${DocsGet.GetDocAttachment}/${cover.doc}/${cover.file}`} style={{ objectPosition: `center ${offset ?? 50}%` }} />
  )
}
