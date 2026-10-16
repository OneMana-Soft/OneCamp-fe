import type { ReactNode } from "react"
import { useId } from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { Spark, SPARK_PATH } from "@/components/ui/graphics"
import { workspaceName } from "@/lib/workspaceName"
import { APP_BOOT_NAME_ATTR } from "@/lib/appBoot"

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

/**
 * The app's splash as the first paint shows it, before any code has run
 * (lib/appBoot, from the root layout): the frame, the ring and "Opening
 * <workspace>". The same frame and ring as the app's own splash, which takes
 * over from it with the ring already drawn. display is the caller's: hidden
 * by a style rule unless the document is an app address.
 *
 * The markup has the build's name; the boot script puts in the name the
 * server gave last time in this browser, as the app's splash will say it
 * (hooks/useWorkspaceName). So the text React hydrates may not be the text
 * it rendered, which is what suppressHydrationWarning is for: it keeps the
 * script's.
 */
export function AppBootScreen({ className }: { className?: string }) {
  const nameSlot = { [APP_BOOT_NAME_ATTR]: "" }
  return (
    <SplashFrame role="status" aria-live="polite" data-app-boot-screen="" className={className}>
      <SplashRing />
      <p className="splash-line text-xs text-ink-3">
        Opening <span {...nameSlot} suppressHydrationWarning>{workspaceName()}</span>
      </p>
    </SplashFrame>
  )
}

/** The server's host, for "Still connecting to …". */
export function serverHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_BACKEND_URL || "").host || "the server"
  } catch {
    return "the server"
  }
}
