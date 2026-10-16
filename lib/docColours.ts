// Doc colours by name (N15): "sky", "sky_background". The API's: ContentCodec/colours.go.
export const DOC_COLOURS = ["gray", "sun", "moss", "lake", "sky", "dusk", "berry"] as const
export type DocColour = (typeof DOC_COLOURS)[number]

export const COLOUR_LABEL: Record<DocColour, string> = { gray: "Grey", sun: "Yellow", moss: "Green", lake: "Teal", sky: "Blue", dusk: "Purple", berry: "Red" }

export const isDocColour = (v: unknown): v is DocColour => DOC_COLOURS.includes(v as DocColour)

export const BLOCK_COLOUR_NODES = ["paragraph", "heading", "blockquote", "listItem", "taskItem", "collapsible"]

export const inkOf = (c: DocColour) => (c === "gray" ? "var(--ink-2)" : `var(--camp-${c}-ink)`)
export const tintOf = (c: DocColour) => (c === "gray" ? "var(--press)" : `var(--camp-${c}-tint)`)

const NAMES = `(${DOC_COLOURS.join("|")})`
const STORED = new RegExp(`^(?:${NAMES}|var\\(--camp-${NAMES}-ink\\))$`)
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))

// A stored text colour's name (var(--camp-sky-ink) is "sky"), or null.
export function colourName(v: unknown): DocColour | null {
  const m = typeof v === "string" ? STORED.exec(asciiLower(v.trim())) : null
  return m ? ((m[1] ?? m[2]) as DocColour) : null
}

export function blockColourValue(v: unknown): string | null {
  if (typeof v !== "string") return null
  const [colour, background, ...rest] = v.split("_")
  return !rest.length && isDocColour(colour) && (background === undefined || background === "background") ? v : null
}
