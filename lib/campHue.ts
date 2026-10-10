/**
 * The camp palette's six identity hues, and which one a thing is.
 *
 * Every person, project, channel, team, doc and calendar gets a stable hue
 * (the playful layer of 10 Oct 2026, "Where colour goes"). Stable is the whole
 * point: a project's colour follows it from the sidebar to the board to the
 * calendar, so the same id must land on the same hue on every screen, in
 * every session, in both repos. A colour the person picked wins over the hash.
 *
 * The order is the chart order (sky, moss, sun, dusk, berry, lake), which is
 * also what the hash indexes, so reordering this list recolours everybody.
 * campHue.test.ts pins a handful of ids to their hues to stop that happening
 * by accident.
 *
 * The same file lives in the storefront (onemana-frontend lib/campHue.ts).
 * Change both or neither.
 */

export const CAMP_HUES = ["sky", "moss", "sun", "dusk", "berry", "lake"] as const

export type CampHue = (typeof CAMP_HUES)[number]

export function isCampHue(value: unknown): value is CampHue {
  return typeof value === "string" && (CAMP_HUES as readonly string[]).includes(value)
}

/**
 * Mixed into every id before hashing. Any salt spreads real ids equally well;
 * this one was chosen because it spreads the demo's own cast. Unsalted, Sam
 * Rivera, Maya Chen and Jonas Weber all hashed to dusk, so the first avatar
 * row a buyer sees would have been one colour. With it they are lake, moss and
 * berry. Changing it recolours everybody, which campHue.test.ts pins.
 */
const SALT = "camp:"

/**
 * FNV-1a over the UTF-16 code units, then murmur3's finaliser.
 *
 * FNV alone leaves ids that differ in their last character ("user-1",
 * "user-2") close together in the low bits, and the low bits are exactly what
 * `% 6` reads, so a team of sequentially numbered people came out in two
 * colours. The finaliser spreads every input bit across the word.
 */
function hash32(id: string): number {
  const text = SALT + id
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Colour names a picker, an import or a calendar may already have stored,
 * folded onto the nearest camp hue. Orange lands on sun, not on the brand: the
 * accent marks the one action on a view and is never anybody's identity.
 */
const NAMED: Record<string, CampHue> = {
  sun: "sun", moss: "moss", lake: "lake", sky: "sky", dusk: "dusk", berry: "berry",
  yellow: "sun", amber: "sun", orange: "sun", gold: "sun",
  lime: "moss", green: "moss", emerald: "moss",
  teal: "lake", cyan: "lake", turquoise: "lake",
  blue: "sky",
  indigo: "dusk", violet: "dusk", purple: "dusk", lavender: "dusk",
  pink: "berry", rose: "berry", red: "berry", fuchsia: "berry", magenta: "berry", crimson: "berry",
}

/** The hue angle (HSL) of each strong cut in light mode, for folding a hex onto the six. */
const ANCHORS: ReadonlyArray<readonly [CampHue, number]> = [
  ["sun", 42],
  ["moss", 144],
  ["lake", 186],
  ["sky", 216],
  ["dusk", 253],
  ["berry", 338],
]

function hexHue(hex: string): CampHue | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const digits = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  // A grey, a near-black or a near-white names no hue: the id decides.
  if (chroma < 0.12) return null
  let h: number
  if (max === r) h = ((g - b) / chroma) % 6
  else if (max === g) h = (b - r) / chroma + 2
  else h = (r - g) / chroma + 4
  const angle = (h * 60 + 360) % 360
  let best: CampHue = "sky"
  let bestDistance = Infinity
  for (const [hue, anchor] of ANCHORS) {
    const d = Math.min(Math.abs(angle - anchor), 360 - Math.abs(angle - anchor))
    if (d < bestDistance) {
      best = hue
      bestDistance = d
    }
  }
  return best
}

/**
 * A colour someone picked, as one of the six hues: a camp hue's own name, a
 * palette name ("emerald", "rose"), or a hex ("#3B82F6"). Null when it names
 * none (empty, a grey, or something unrecognised), so the id decides instead.
 */
export function campHueOf(colour: string | null | undefined): CampHue | null {
  if (!colour) return null
  const key = colour.trim().toLowerCase()
  if (!key) return null
  if (key in NAMED) return NAMED[key]
  return key.startsWith("#") ? hexHue(key) : null
}

/**
 * The hue a thing is: the colour its owner picked when there is one, else a
 * stable hash of its id (a uuid, or whatever the screen keys it by; ids are
 * compared without case or surrounding space). With neither, the first hue.
 */
export function hueFor(id: string | null | undefined, chosen?: string | null): CampHue {
  const picked = campHueOf(chosen)
  if (picked) return picked
  const key = (id ?? "").trim().toLowerCase()
  if (!key) return CAMP_HUES[0]
  return CAMP_HUES[hash32(key) % CAMP_HUES.length]
}
