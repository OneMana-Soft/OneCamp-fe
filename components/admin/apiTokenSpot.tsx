import type { CampHue } from "@/lib/campHue"
import { HUE_CLASS, cx } from "@/components/ui/graphics/hues"

/**
 * The empty API tokens list's spot (design v3, admin S7 and §1.7): a key on
 * the motif, in the spot family's vocabulary (spots.tsx): a disc of the hue's
 * tint, the object in the card colour outlined in the hue's ink at 2px, the
 * motif in its strong cut, and one spark of a second hue. 96px; decorative.
 * Kept beside the tokens card, not in the shared spot set, which the
 * storefront carries too and holds to its own list.
 */
export function SpotKey({ size = 96, hue = "berry", className }: { size?: number; hue?: CampHue; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-spot=""
      data-spot-key=""
      className={cx(HUE_CLASS[hue], className)}
    >
      <circle cx="48" cy="48" r="32" className="fill-hue-tint" />
      <circle cx="48" cy="48" r="42" className="stroke-hue" strokeWidth="1.5" strokeDasharray="0 5" />
      <g className="stroke-hue-ink" strokeWidth="2">
        <circle cx="38" cy="44" r="11" className="fill-card" />
        <circle cx="38" cy="44" r="3.5" />
        <path d="M47 51l17 17M58 62l5-5M63 67l4-4" />
      </g>
      <path d="M74 18Q75 23 80 24Q75 25 74 30Q73 25 68 24Q73 23 74 18Z" className="fill-camp-sun" />
    </svg>
  )
}
