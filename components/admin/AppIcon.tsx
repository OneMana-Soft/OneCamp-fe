"use client"

// AppIcon renders an app's icon from a URL, falling back to a neutral Plug
// glyph when the URL is missing OR fails to load. App icons come from external
// CDNs (e.g. Simple Icons) that occasionally 404 — without this, the admin sees
// a broken-image box and the console fills with 404 noise. The onError handler
// flips to the fallback exactly once (guarded so a failing fallback can't loop).
//
// Design v3 (admin §A19): a 40px tile at r10 (36px for a list row) on the
// sunken surface with a hairline ring; the fallback glyph is ink-3, never a hue.

import { useState } from "react"
import { Plug } from "@/lib/icons"

export default function AppIcon({
    src,
    alt,
    size = "md",
}: {
    src?: string
    alt: string
    size?: "sm" | "md"
}) {
    const [failed, setFailed] = useState(false)
    return (
        <div data-app-icon="" data-size={size} className="cx-app-icon">
            {src && !failed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={alt}
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                />
            ) : (
                <Plug aria-hidden="true" />
            )}
        </div>
    )
}
