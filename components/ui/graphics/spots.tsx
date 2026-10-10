import type { ReactNode } from "react"

import type { CampHue } from "@/lib/campHue"

import { HUE_CLASS, cx } from "./hues"

/**
 * Spot illustrations (the playful layer, "The graphic language"): empty
 * states, onboarding, errors and the 404, each composed from the motif (a
 * tint disc, a ring, an orbit, an arc, a spark) plus one simple object.
 *
 * One family, so they can sit anywhere together: a disc of the hue's tint,
 * the object in the card colour outlined in the hue's ink at 2px, the motif in
 * its strong cut, and at most one spark of a second hue. Inline SVG, about 600
 * bytes each at most (spots.test.tsx holds every one to it), themed by the
 * tokens in both modes, and decorative: the words beside them say what is
 * empty or wrong. No image files.
 *
 *   <SpotInbox />                    96px, its own hue
 *   <SpotDocs size={64} hue="lake" />
 *
 * The same file lives in the storefront (onemana-frontend).
 */
export interface SpotProps {
  /** In px (96 by default). */
  size?: number
  /** Overrides the illustration's own hue. */
  hue?: CampHue
  className?: string
}

function Spot({ size = 96, hue, className, children }: SpotProps & { hue: CampHue; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // On a phone, globals.css caps a spot at 72px (SPOTS ON A PHONE).
      data-spot=""
      className={cx(HUE_CLASS[hue], className)}
    >
      {children}
    </svg>
  )
}

/** An empty inbox: a ringed envelope, a message dot riding its orbit. */
export function SpotInbox({ hue = "sky", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="46" cy="48" r="32" className="fill-hue-tint"/>
      <circle cx="46" cy="48" r="42" className="stroke-hue" strokeWidth="1.5" strokeDasharray="0 5"/>
      <circle cx="83" cy="32" r="4" className="fill-hue"/>
      <g className="stroke-hue-ink" strokeWidth="2">
        <rect x="27" y="36" width="40" height="28" rx="4" className="fill-card"/>
        <path d="m29 39 18 13 18-13"/>
      </g>
      <path d="M20 16Q21 21 26 22Q21 23 20 28Q19 23 14 22Q19 21 20 16Z" className="fill-camp-sun"/>
    </Spot>
  )
}

/** No tasks left: a check in the ripples of the moment it was ticked. */
export function SpotTasks({ hue = "moss", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="48" cy="48" r="30" className="fill-hue-tint"/>
      <g className="stroke-hue" strokeWidth="1.5">
        <circle cx="48" cy="48" r="38" opacity=".5"/>
        <circle cx="48" cy="48" r="45" opacity=".25"/>
      </g>
      <path d="m35 49 9 9 18-19" className="stroke-hue-ink" strokeWidth="5"/>
      <path d="M76 14Q77 19 82 20Q77 21 76 26Q75 21 70 20Q75 19 76 14Z" className="fill-camp-sun"/>
    </Spot>
  )
}

/** No docs yet: a page with the ring's arc behind it. */
export function SpotDocs({ hue = "dusk", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="52" cy="50" r="32" className="fill-hue-tint"/>
      <path d="M76 30a32 32 0 0 1 0 40" className="stroke-hue" strokeWidth="6"/>
      <g className="stroke-hue-ink" strokeWidth="2">
        <path d="M31 22h22l11 11v41H31z" className="fill-card"/>
        <path d="M53 22v11h11M38 44h18M38 52h18M38 60h10"/>
      </g>
      <path d="M38 44h12" className="stroke-hue" strokeWidth="2"/>
      <path d="M20 65Q20.8 69.2 25 70Q20.8 70.8 20 75Q19.2 70.8 15 70Q19.2 69.2 20 65Z" className="fill-camp-sun"/>
    </Spot>
  )
}

/** A clear calendar: a sheet on two binder rings, today marked. */
export function SpotCalendar({ hue = "berry", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="48" cy="52" r="32" className="fill-hue-tint"/>
      <rect x="24" y="28" width="48" height="44" rx="6" className="fill-card stroke-hue-ink" strokeWidth="2"/>
      <path d="M35 52h26M35 63h26" className="stroke-hue-ink" strokeWidth="4" strokeDasharray="0 13" opacity=".35"/>
      <path d="M33 27a4 4 0 1 0 8 0a4 4 0 1 0-8 0m22 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M25 40h46" className="stroke-hue" strokeWidth="3"/>
      <circle cx="61" cy="52" r="4.5" className="fill-hue"/>
    </Spot>
  )
}

/** Nothing found: the lens is the logo's ring, an empty orbit inside it. */
export function SpotSearch({ hue = "lake", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="42" cy="44" r="32" className="fill-hue-tint"/>
      <circle cx="42" cy="44" r="13" className="stroke-hue" strokeWidth="1.5" strokeDasharray="0 4"/>
      <circle cx="42" cy="44" r="19" className="stroke-hue-ink" strokeWidth="6"/>
      <path d="m56 58 15 15" className="stroke-hue-ink" strokeWidth="7"/>
      <path d="M80 16Q81 21 86 22Q81 23 80 28Q79 23 74 22Q79 21 80 16Z" className="fill-camp-sun"/>
      <circle cx="16" cy="70" r="3" className="fill-hue"/>
    </Spot>
  )
}

/** Integrations: a plug meeting the ring it connects to. */
export function SpotPlug({ hue = "sun", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="48" cy="48" r="32" className="fill-hue-tint"/>
      <circle cx="28" cy="44" r="10" className="stroke-hue" strokeWidth="5"/>
      <g className="stroke-hue-ink" strokeWidth="2">
        <rect x="54" y="35" width="18" height="18" rx="4" className="fill-card"/>
        <path d="M54 40h-7M54 48h-7M63 53v7a10 10 0 0 1-10 10h-5"/>
      </g>
      <path d="M42 22Q42.6 25.4 46 26Q42.6 26.6 42 30Q41.4 26.6 38 26Q41.4 25.4 42 22Z" className="fill-camp-sky"/>
    </Spot>
  )
}

/** Something broke, or the page is gone: the ring with a piece out. */
export function SpotError({ hue = "dusk", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="48" cy="48" r="32" className="fill-hue-tint"/>
      <circle cx="48" cy="48" r="42" className="stroke-hue" strokeWidth="1.5" strokeDasharray="0 5"/>
      <path d="M65.3 38A20 20 0 1 1 51.5 28.3" className="stroke-hue-ink" strokeWidth="6"/>
      <path d="M62.2 19.7a20 20 0 0 1 11.2 7.8" className="stroke-hue" strokeWidth="6"/>
      <path d="M20 71Q20.8 75.2 25 76Q20.8 76.8 20 81Q19.2 76.8 15 76Q19.2 75.2 20 71Z" className="fill-camp-berry"/>
    </Spot>
  )
}

/** Welcome: the workspace's ring, with people and channels on its orbit. */
export function SpotWelcome({ hue = "sky", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="48" cy="48" r="40" className="stroke-hue" strokeWidth="1.5" strokeDasharray="0 5"/>
      <circle cx="48" cy="48" r="13" className="stroke-brand" strokeWidth="6"/>
      <circle cx="48" cy="8" r="5" className="fill-camp-sky"/>
      <circle cx="86" cy="36" r="4" className="fill-camp-moss"/>
      <circle cx="72" cy="80" r="5" className="fill-camp-sun"/>
      <circle cx="18" cy="74" r="4" className="fill-camp-dusk"/>
      <circle cx="12" cy="34" r="4.5" className="fill-camp-berry"/>
    </Spot>
  )
}

/** An import finished: into the tray, inside a ring that has closed. */
export function SpotImported({ hue = "moss", ...props }: SpotProps) {
  return (
    <Spot hue={hue} {...props}>
      <circle cx="48" cy="50" r="32" className="fill-hue-tint"/>
      <path d="M48 18a32 32 0 1 1-30 21" className="stroke-hue" strokeWidth="5"/>
      <g className="stroke-hue-ink" strokeWidth="2">
        <path d="M30 52v10a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4V52" className="fill-card"/>
        <path d="M48 30v24m-8-8 8 8 8-8"/>
      </g>
      <path d="M76 14Q77 19 82 20Q77 21 76 26Q75 21 70 20Q75 19 76 14Z" className="fill-camp-sun"/>
    </Spot>
  )
}

/** Every spot illustration by name, for the showcase and for picking one by key. */
export const SPOTS = {
  inbox: SpotInbox,
  tasks: SpotTasks,
  docs: SpotDocs,
  calendar: SpotCalendar,
  search: SpotSearch,
  plug: SpotPlug,
  error: SpotError,
  welcome: SpotWelcome,
  imported: SpotImported,
} as const
