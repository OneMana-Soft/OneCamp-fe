"use client"

// AppIcon renders an app's icon from a URL, falling back to a neutral Plug
// glyph when the URL is missing OR fails to load. App icons come from external
// CDNs (e.g. Simple Icons) that occasionally 404 — without this, the admin sees
// a broken-image box and the console fills with 404 noise. The onError handler
// flips to the fallback exactly once (guarded so a failing fallback can't loop).

import React, { useState } from "react"
import { Plug } from "lucide-react"

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
    const box = size === "sm" ? "h-9 w-9" : "h-10 w-10"
    const img = size === "sm" ? "h-full w-full object-cover" : "h-6 w-6 object-contain"
    const glyph = size === "sm" ? "h-4 w-4" : "h-5 w-5"

    return (
        <div className={`${box} shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden`}>
            {src && !failed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={alt}
                    className={img}
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                />
            ) : (
                <Plug className={`${glyph} text-muted-foreground`} />
            )}
        </div>
    )
}
