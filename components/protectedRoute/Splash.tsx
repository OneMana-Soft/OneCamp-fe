import type { CSSProperties, ReactNode } from "react"
import { useId } from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { Spark, SPARK_PATH } from "@/components/ui/graphics"
import { workspaceName } from "@/lib/workspaceName"
import { APP_BOOT_NAME_ATTR, APP_BOOT_RETRY_ATTR } from "@/lib/appBoot"

/** The logo's gradient (the shell's mark and the auth pages' ring draw the same two stops). */
const LOGO_FROM = "#FF8A00"
const LOGO_TO = "#FF3D00"

/**
 * Where each of the ring's three arcs starts, as a dash offset on a circle of
 * path length 3 (a third is 1; 0 is three o'clock): twelve, four and eight
 * o'clock, each 1.06 long so it runs a little under the next and the three
 * close with no seam. Drawn where it ends up, so once it has landed its
 * gradient is the ring's own; only a transform brings it in.
 */
const ARC_OFFSETS = [0.78, -0.22, -1.22]

/** A point on a circle round the scene's centre, in its 160px box, to a tenth of a pixel. Pure. */
const onOrbit = (r: number, deg: number) => {
  const at = (v: number) => Math.round(v * 10) / 10
  return { left: at(80 + r * Math.cos((deg * Math.PI) / 180)), top: at(80 + r * Math.sin((deg * Math.PI) / 180)) }
}

/**
 * The splash's scene (design v3 §3.13, the camp; 17 Oct 2026): a halo of the
 * theme's glow, two orbits, three hue dots and the logo's ring, 160px. The
 * ring assembles from three arcs, closes with one ripple and is joined by the
 * spark; then the halo breathes and the dots drift round, slowly, until the
 * app is there (globals.css, THE SPLASH). Every moving part is its own
 * element moved by transform and opacity, so the compositor runs it while
 * the app's code loads. Under reduced motion it is all there, still.
 *
 * `people` is the demo's start: two of its people on their own hues and the
 * agent as its square with the spark, on the inner orbit (admin critic #21).
 * Nobody's face is on a member's splash.
 *
 * Decorative: the line under it says what is happening.
 */
export function SplashScene({ people = false }: { people?: boolean }) {
  // Each instance its own gradient: a page can hold two (the layout's and
  // the demo's), and Chrome paints nothing from a gradient in a hidden one.
  const id = `ss${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const ring = `url(#${id})`
  const moss = onOrbit(76, 150)
  const sun = onOrbit(54, 105)
  const sky = onOrbit(76, -78)
  return (
    <div data-splash-scene="" aria-hidden="true" className="splash-scene">
      <span className="ss-halo" />
      <svg className="ss-orbits" viewBox="0 0 160 160">
        {/* Here, in an SVG that is always drawn, for the arcs and the ring. */}
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="46" y2="46">
            <stop stopColor={LOGO_FROM} />
            <stop offset="1" stopColor={LOGO_TO} />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="76" />
        <circle className="ss-dash" cx="80" cy="80" r="54" />
      </svg>
      <svg className="ss-dots" viewBox="0 0 160 160">
        <circle cx={moss.left} cy={moss.top} r="3" className="fill-camp-moss" />
        <circle cx={sun.left} cy={sun.top} r="3.5" className="fill-camp-sun" />
        <circle cx={sky.left} cy={sky.top} r="2.5" className="fill-camp-sky" />
      </svg>
      {ARC_OFFSETS.map((offset, i) => (
        <svg key={i} className="ss-arc" style={{ "--i": i } as CSSProperties} viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="18" pathLength={3} strokeDasharray="1.06 1.94" strokeDashoffset={offset} stroke={ring} />
        </svg>
      ))}
      <svg className="ss-ring" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="18" stroke={ring} />
      </svg>
      <span className="ss-ripple" />
      <svg className="ss-spark" viewBox="0 0 24 24">
        <path d={SPARK_PATH} />
      </svg>
      {people && <DemoPeople />}
    </div>
  )
}

/** The demo's people on the inner orbit: Sam and Maya on their own hues, and the agent's square. */
function DemoPeople() {
  const sam = onOrbit(54, -140)
  const maya = onOrbit(54, 35)
  const agent = onOrbit(54, -32)
  return (
    <>
      <span className={cn("avatar-person ss-face rounded-full", HUE_CLASS.lake)} style={{ left: sam.left, top: sam.top, width: 28, height: 28, "--i": 0 } as CSSProperties}>
        SR
      </span>
      <span className={cn("avatar-person ss-face rounded-full", HUE_CLASS.moss)} style={{ left: maya.left, top: maya.top, width: 24, height: 24, "--i": 1 } as CSSProperties}>
        MC
      </span>
      <span className="avatar-agent ss-face" style={{ left: agent.left, top: agent.top, width: 24, height: 24, "--i": 2 } as CSSProperties}>
        <Spark size={12} />
      </span>
    </>
  )
}

/**
 * The ground the app opens on (.app-frame: the frame with the theme's
 * campfire glow and the grain; on a phone the sheet with the phone's glow,
 * globals.css), with whatever is centred on it.
 */
export function SplashFrame({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-splash="" className={cn("app-frame splash", className)} {...rest}>
      {children}
    </div>
  )
}

/** "Opening <workspace>": the workspace in ink, as the place being opened. */
export function SplashOpening({ name }: { name: ReactNode }) {
  return <p className="splash-line splash-opening text-xs">Opening {name}</p>
}

/**
 * "Still connecting to <host>…" with a ghost Try again. A plain button on the
 * interaction layer (app/interaction.css draws its hover, press and focus):
 * the layout's copy is in every page's first paint, and the Button's classes
 * were most of its weight.
 */
function SplashSlow({ onRetry, shown, retry }: { onRetry?: () => void; shown?: boolean; retry?: Record<string, string> }) {
  return (
    <p className="splash-line splash-slow text-xs" data-shown={shown ? "" : undefined}>
      Still connecting to {serverHost()}…
      <button type="button" data-interactive="button" className="splash-retry" onClick={onRetry} {...retry}>
        Try again
      </button>
    </p>
  )
}

/**
 * The app's splash as the first paint shows it, before any code has run
 * (lib/appBoot, from the root layout): the frame, the scene and "Opening
 * <workspace>". It stays the splash until the app is there: the app holds
 * it while it asks who is signed in, says it is slow from its state (the
 * Try again here is the app's to answer), and fades it out over the shell.
 * display is the caller's: hidden by a style rule unless the document is an
 * app address.
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
      <SplashScene />
      <SplashOpening
        name={
          <span className="splash-name" {...nameSlot} suppressHydrationWarning>
            {workspaceName()}
          </span>
        }
      />
      <SplashSlow retry={{ [APP_BOOT_RETRY_ATTR]: "" }} />
    </SplashFrame>
  )
}

/**
 * The splash drawn by the app itself, where the layout has none to hold:
 * the same frame and scene, the line or the slow note under it.
 */
export function OwnSplash({ name, slow, onRetry }: { name: ReactNode; slow: boolean; onRetry: () => void }) {
  return (
    <SplashFrame role="status" aria-live="polite" className="fixed inset-0 z-[var(--z-toast)]">
      <SplashScene />
      {slow ? <SplashSlow shown onRetry={onRetry} /> : <SplashOpening name={<span className="splash-name">{name}</span>} />}
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
