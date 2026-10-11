// Spot illustrations the signed-out pages need beyond the shared set
// (components/ui/graphics/spots.tsx is the foundation's; these follow its
// family: a tint disc, the object on the card colour in the hue's ink at 2px,
// the motif in its strong cut, one spark). Decorative: the words say it all.

import type { ReactNode } from "react"
import type { CampHue } from "@/lib/campHue"
import { Check } from "@/lib/icons"
import { HUE_CLASS, SpotInbox, cx } from "@/components/ui/graphics"
import { Spark } from "@/components/ui/graphics/motifs"

function Spot({ size = 96, hue, children }: { size?: number; hue: CampHue; children: ReactNode }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-spot="" className={cx(HUE_CLASS[hue])}>
      {children}
    </svg>
  )
}

/** A reset link that is missing or used: a key in the ring's orbit. */
export function SpotKey({ size = 96, hue = "sun" }: { size?: number; hue?: CampHue }) {
  return (
    <Spot size={size} hue={hue}>
      <circle cx="48" cy="48" r="32" className="fill-hue-tint" />
      <circle cx="48" cy="48" r="42" className="stroke-hue" strokeWidth="1.5" strokeDasharray="0 5" />
      <g className="stroke-hue-ink" strokeWidth="2">
        <circle cx="38" cy="44" r="11" className="fill-card" />
        <path d="M46 52 66 72M58 64l5-5M63 69l4-4" />
      </g>
      <circle cx="38" cy="44" r="4" className="fill-hue" />
      <path d="M78 16Q79 21 84 22Q79 23 78 28Q77 23 72 22Q77 21 78 16Z" className="fill-camp-sky" />
    </Spot>
  )
}

/** No access: a shield with a lock in it. */
export function SpotShieldLock({ size = 96, hue = "dusk" }: { size?: number; hue?: CampHue }) {
  return (
    <Spot size={size} hue={hue}>
      <circle cx="48" cy="50" r="32" className="fill-hue-tint" />
      <circle cx="48" cy="50" r="42" className="stroke-hue" strokeWidth="1.5" strokeDasharray="0 5" />
      <path d="M48 20 70 28v16c0 15-10 24-22 30-12-6-22-15-22-30V28z" className="fill-card stroke-hue-ink" strokeWidth="2" />
      <rect x="39" y="45" width="18" height="14" rx="3" className="fill-hue" />
      <path d="M43 45v-4a5 5 0 0 1 10 0v4" className="stroke-hue-ink" strokeWidth="2" />
      <path d="M80 70Q81 75 86 76Q81 77 80 82Q79 77 74 76Q79 75 80 70Z" className="fill-camp-sun" />
    </Spot>
  )
}

/**
 * The envelope with a badge at its corner: a moss check (done, unsubscribed)
 * or a sun spark (back on the list). The badge springs in as it changes.
 */
export function SpotEnvelopeBadge({ badge, size = 96 }: { badge?: "check" | "spark"; size?: number }) {
  return (
    <span className="auth-spot" data-envelope-badge={badge ?? "none"}>
      <SpotInbox size={size} hue={badge ? "sky" : "lake"} />
      {badge === "check" && (
        <span key="check" className="auth-badge text-white" style={{ background: "var(--camp-moss)" }}>
          <Check aria-hidden="true" />
        </span>
      )}
      {badge === "spark" && (
        <span key="spark" className="auth-badge" style={{ background: "var(--camp-sun-tint)" }}>
          <Spark hue="sun" size={14} />
        </span>
      )}
    </span>
  )
}
