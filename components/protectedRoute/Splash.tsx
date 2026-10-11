import type { ReactNode } from "react"
import { useId } from "react"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * The logo ring, drawn once (design v3, shell §L1): 56px, an 8px stroke in the
 * logo's gradient, round caps, from 12 o'clock over 600ms. Under reduced
 * motion it is simply there. SVG and CSS only (firstLoad.test.ts: the splash
 * loads no animation library).
 */
export function SplashRing({ size = 56, draw = true, className }: { size?: number; draw?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "")
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" data-splash-ring="" className={className}>
      <defs>
        <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8A00" />
          <stop offset="1" stopColor="#FF3D00" />
        </linearGradient>
      </defs>
      <circle
        cx="28"
        cy="28"
        r="18"
        fill="none"
        stroke={`url(#ring-${id})`}
        strokeWidth="8"
        strokeLinecap="round"
        pathLength={100}
        transform="rotate(-90 28 28)"
        className={draw ? "splash-ring-draw" : undefined}
      />
    </svg>
  )
}

/**
 * The frame the app opens on: graphite, the theme's campfire glow and the
 * grain (.app-frame), with whatever is centred on it. Nothing shows for the
 * first 150ms but the frame colour, so a fast load never flashes a splash.
 */
export function SplashFrame({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-splash="" className={cn("app-frame splash", className)} {...rest}>
      {children}
    </div>
  )
}

/** The workspace's name as the env gives it, or a plain fallback. */
export function workspaceName(): string {
  return process.env.NEXT_PUBLIC_ORG_NAME?.trim() || "OneCamp"
}

/** The server's host, for "Still connecting to …". */
export function serverHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_BACKEND_URL || "").host || "the server"
  } catch {
    return "the server"
  }
}
