import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import postcss, { type Root } from "postcss"
import { describe, expect, it } from "vitest"

import { contrastRatio, oklchToRgb, parseOklch, rgbToHex } from "@/lib/color/oklch"

/**
 * EVERY INK ON EVERY SURFACE (decision D-SD4, 13 Oct 2026, DESIGN_V3.md
 * "Decisions after approval").
 *
 * Text reads at WCAG AA, 4.5:1, on every ground it sits on, in light and in
 * dark, under every theme. ink-3 is the meta tier: timestamps, counts, the
 * agent provenance line, unfurl meta. It measured 3.36:1 on the chat surface.
 * ink-4 is decoration and carries no text anyone has to read; the scan at the
 * end holds the code to that.
 *
 * A ground is a surface at rest or under an overlay it carries text under:
 * hover (a row under the pointer), press (a menu's highlighted row, a selected
 * row, an open trigger, a segmented control's track) and sel (multi-select).
 * Each theme's "about you" ground, an agent's tint and the identity tints are
 * grounds too. The sidebar and the tablet rail are measured on their own,
 * because the frame there is lit: the campfire glow and the grain, with a
 * row's hover or open state on top, read from the stylesheet itself.
 *
 * Every colour token in globals.css and themes.css is classified below. A new
 * one fails this file until it says what it is to text: a ground every ink is
 * checked on, an ink checked on every ground, or neither, and why.
 */

type Mode = "light" | "dark"
type RGB = { r: number; g: number; b: number }
type State = "rest" | "hover" | "press" | "sel"

const MODES: Mode[] = ["light", "dark"]
const AA = 4.5
const REPO = join(__dirname, "..")
const SHEET = postcss.parse(readFileSync(join(__dirname, "globals.css"), "utf8"))
const THEME_SHEET = postcss.parse(readFileSync(join(__dirname, "themes.css"), "utf8"))

/** The custom properties of every rule with exactly this selector in its list, later rules winning. */
function props(root: Root, selector: string): Map<string, string> {
  const out = new Map<string, string>()
  root.walkRules((rule) => {
    if (!rule.selectors.map((s) => s.trim()).includes(selector)) return
    rule.each((d) => {
      if (d.type === "decl" && d.prop.startsWith("--")) out.set(d.prop.slice(2), d.value.trim())
    })
  })
  return out
}

const LIGHT = props(SHEET, ":root")
const DARK = props(SHEET, ".dark")
const BODY = props(SHEET, "body")
const THEMES = THEME_SHEET.nodes.flatMap((n) => (n.type === "rule" ? n.selectors : [])).map((s) => /^\.theme-([a-z]+)$/.exec(s.trim())?.[1]).filter((t): t is string => !!t)
const THEME = Object.fromEntries(THEMES.map((t) => [t, { light: props(THEME_SHEET, `.theme-${t}`), dark: props(THEME_SHEET, `.dark .theme-${t}`) }]))

/** A token's value in a mode and theme, following var() aliases as the browser does. */
function value(name: string, mode: Mode, theme?: string): string {
  const v = (theme ? THEME[theme][mode].get(name) : undefined) ?? (mode === "dark" ? DARK.get(name) : undefined) ?? LIGHT.get(name) ?? BODY.get(name)
  if (v === undefined) throw new Error(`--${name} is not declared (${mode}${theme ? `, ${theme}` : ""})`)
  const ref = /^var\(--([\w-]+)\)$/.exec(v)
  return ref ? value(ref[1], mode, theme) : v
}

function rgba(raw: string): RGB & { a: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(raw)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(raw)
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] }
  const ok = parseOklch(raw)
  if (ok) return { ...oklchToRgb(ok.l, ok.c, ok.h), a: 1 }
  throw new Error(`a colour this test can't read: ${raw}`)
}

/** An opaque token as painted. */
function paint(name: string, mode: Mode, theme?: string): RGB {
  const c = rgba(value(name, mode, theme))
  if (c.a !== 1) throw new Error(`--${name} is translucent; paint it over a ground`)
  return { r: c.r, g: c.g, b: c.b }
}

/** `top` at `alpha` over `ground`, as the browser composites a translucent layer. */
function over(top: RGB, alpha: number, ground: RGB): RGB {
  const mix = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha))
  return { r: mix(top.r, ground.r), g: mix(top.g, ground.g), b: mix(top.b, ground.b) }
}

/** A surface under an overlay (hover, press, sel: ink or white at a low alpha). */
function under(state: State, ground: RGB, mode: Mode): RGB {
  if (state === "rest") return ground
  const o = rgba(value(state, mode))
  return over(o, o.a, ground)
}

const say = (fg: RGB, bg: RGB) => `${rgbToHex(fg)} on ${rgbToHex(bg)} is ${contrastRatio(fg, bg).toFixed(2)}:1`

/* ── What every colour token is to text ──────────────────────────────────── */

const ALL: readonly State[] = ["rest", "hover", "press", "sel"]

type Role =
  | { is: "surface"; states: readonly State[]; themed?: true; why: string }
  | { is: "overlay"; why: string }
  | { is: "ink"; why: string }
  | { is: "accent ink"; themed?: true; own?: string[]; why: string }
  | { is: "decoration"; why: string }
  | { is: "glow"; why: string }
  | { is: "checked elsewhere"; why: string }
  | { is: "not text"; why: string }

const ROLES: Record<string, Role> = {
  frame: { is: "surface", states: ["rest", "hover"], why: "the bare frame round a guest, form or invoice page's cards; the sidebar's lit frame is measured below" },
  sheet: { is: "surface", states: ALL, why: "the main panel: the chat surface, lists, a doc" },
  sunken: { is: "surface", states: ALL, why: "group headers, board columns, code, comment cards" },
  raised: { is: "surface", states: ALL, why: "cards, inputs, the composer, the selected nav chip" },
  pop: { is: "surface", states: ALL, why: "menus and popovers; press is the highlighted row" },
  panel: { is: "surface", states: ALL, why: "the task panel" },
  "brand-muted": { is: "surface", states: ["rest"], themed: true, why: "about you: a mention row, the current agenda event, a selected row" },
  "agent-muted": { is: "surface", states: ["rest"], why: "an agent's tinted ground" },
  hover: { is: "overlay", why: "a row under the pointer, a ghost button" },
  press: { is: "overlay", why: "a menu's highlighted row, a selected row, an open trigger, a track" },
  sel: { is: "overlay", why: "multi-select" },
  ink: { is: "ink", why: "text and titles" },
  "ink-2": { is: "ink", why: "secondary text and nav labels" },
  "ink-3": { is: "ink", why: "meta: timestamps, counts, the agent provenance line, unfurl meta, placeholders" },
  "ink-4": { is: "decoration", why: "separators, chevrons, disabled states, placeholder glyphs; never text (the scan below)" },
  "brand-text": { is: "accent ink", themed: true, own: ["brand-muted", "brand"], why: "a link, today's date, a mention's time: the accent as text" },
  "agent-ink": { is: "accent ink", own: ["agent-muted"], why: "an agent's tag" },
  "success-ink": { is: "accent ink", why: "a success word" },
  "warning-ink": { is: "accent ink", why: "a warning word" },
  "info-ink": { is: "accent ink", why: "an info word" },
  "danger-ink": { is: "accent ink", why: "a danger word" },
  glow: { is: "glow", why: "the campfire glow's main light, on the frame (.app-frame::before)" },
  glow2: { is: "glow", why: "the glow's second, low light" },
  brand: { is: "checked elsewhere", why: "the accent as a fill and a mark: 3:1 as a mark, its label 4.5:1 (paletteContrast)" },
  "brand-foreground": { is: "checked elsewhere", why: "the label on the accent's fill (paletteContrast)" },
  agent: { is: "checked elsewhere", why: "the agent's strong cut: the spark and marks, and text on the page at rest (paletteContrast)" },
  "agent-foreground": { is: "checked elsewhere", why: "the label on a solid agent fill (paletteContrast)" },
  destructive: { is: "checked elsewhere", why: "the danger fill (paletteContrast, statusColour)" },
  "destructive-foreground": { is: "checked elsewhere", why: "the label on the danger fill (paletteContrast)" },
  success: { is: "checked elsewhere", why: "the success fill; its word is success-ink (paletteContrast)" },
  "success-foreground": { is: "checked elsewhere", why: "the label on the success fill" },
  warning: { is: "checked elsewhere", why: "the warning fill; its word is warning-ink (paletteContrast)" },
  "warning-foreground": { is: "checked elsewhere", why: "the label on the warning fill" },
  info: { is: "checked elsewhere", why: "the info fill; its word is info-ink (paletteContrast)" },
  "info-foreground": { is: "checked elsewhere", why: "the label on the info fill" },
  selection: { is: "checked elsewhere", why: "selected text: the reader's own highlight under the text's ink (paletteContrast)" },
  "progress-from": { is: "not text", why: "a progress fill's first stop" },
  "progress-to": { is: "not text", why: "a progress fill's leading stop (paletteContrast: 3:1 on its track)" },
  line: { is: "not text", why: "a hairline" },
  "line-2": { is: "not text", why: "a ring: kbd, chips" },
  "line-3": { is: "not text", why: "an unchecked box, a dashed orbit" },
  ok: { is: "not text", why: "the presence dot" },
  "tooltip-bg": { is: "not text", why: "a tooltip's ground, under white text only (components/ui/tooltip.tsx)" },
  "board-ground": { is: "not text", why: "a board canvas's place while it loads (CanvasPending), its words for screen readers only; the board's own text is Excalidraw's, on the ground it draws (paletteContrast pins this to it)" },
  "scroll-bar-color": { is: "not text", why: "the scrollbar's thumb" },
  "scroll-bar-bg-color": { is: "not text", why: "the scrollbar's track" },
}

const FAMILIES: Array<[RegExp, Role]> = [
  [/^camp-[a-z]+-tint$/, { is: "surface", states: ["rest"], why: "an identity tint: a tile, a diff row, a meaning chip" }],
  [/^camp-[a-z]+-ink$/, { is: "checked elsewhere", why: "a camp hue as text: on its own tint, the page and a card (paletteContrast)" }],
  [/^(camp-[a-z]+|agent)-a[12]$/, { is: "checked elsewhere", why: "an avatar's gradient stops, under white initials (paletteContrast)" }],
  [/^camp-[a-z]+$/, { is: "checked elsewhere", why: "a camp hue's strong cut: a mark at 3:1 (paletteContrast)" }],
  [/^chart-\d$/, { is: "not text", why: "a chart series (chartPalette)" }],
]

const roleOf = (name: string): Role | undefined => ROLES[name] ?? FAMILIES.find(([re]) => re.test(name))?.[1]

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(|oklch\(|oklab\(|hsla?\(|color\(|color-mix\(|transparent$|var\(--color-[\w-]+\)$|\d+ \d+ \d+$)/i
const ALIAS = /^var\(--(?!color-)[\w-]+\)$/

/** Every token declared with a colour of its own: an alias takes its target's role. */
function colourTokens(): string[] {
  const names = new Set<string>()
  const maps = [LIGHT, DARK, BODY, ...THEMES.flatMap((t) => [THEME[t].light, THEME[t].dark])]
  for (const map of maps) for (const [k, v] of map) if (COLOUR.test(v) && !ALIAS.test(v)) names.add(k)
  return [...names].sort()
}

const TOKENS = colourTokens()
const named = (is: Role["is"]) => TOKENS.filter((t) => roleOf(t)?.is === is)
const SURFACES = named("surface")
const INKS = named("ink")
const ACCENTS = named("accent ink")

describe("every colour token says what it is to text", () => {
  it("found the tokens", () => {
    expect(TOKENS.length).toBeGreaterThan(60)
    expect(THEMES).toHaveLength(11)
  })

  it("classifies each one, so a new surface or ink comes with its contrast", () => {
    const missing = TOKENS.filter((t) => !roleOf(t))
    expect(
      missing,
      "new colour tokens: add each to ROLES in app/inkContrast.test.ts as a surface (every ink is checked on it), an ink (checked on every surface), or neither, with why",
    ).toEqual([])
  })

  it("names only tokens that exist", () => {
    expect(Object.keys(ROLES).filter((t) => !TOKENS.includes(t))).toEqual([])
  })

  it("measures the surfaces and inks the brief names", () => {
    for (const s of ["frame", "sheet", "sunken", "raised", "pop", "panel", "brand-muted", "agent-muted"]) expect(SURFACES).toContain(s)
    expect(INKS).toEqual(["ink", "ink-2", "ink-3"])
  })
})

/* ── The grounds ─────────────────────────────────────────────────────────── */

type Ground = { name: string; rgb: RGB; surface: string; state: State }

function grounds(mode: Mode, theme: string): Ground[] {
  const out: Ground[] = []
  for (const name of SURFACES) {
    const role = roleOf(name) as Extract<Role, { is: "surface" }>
    const base = paint(name, mode, role.themed ? theme : undefined)
    for (const state of role.states) out.push({ name: state === "rest" ? name : `${name} + ${state}`, rgb: under(state, base, mode), surface: name, state })
  }
  // The row that mentions you, in dark: the accent at 10% on the sheet
  // (components/message/baseMessageCard.tsx). In light it is brand-muted at
  // 70% on the sheet, which is lighter than brand-muted itself.
  if (mode === "dark") out.push({ name: "a mention row (the accent at 10% on the sheet)", rgb: over(paint("brand", mode, theme), 0.1, paint("sheet", mode)), surface: "brand", state: "rest" })
  return out
}

/** Where an accent's text sits: content at rest and under hover; press and sel where a row can be; its own ground. */
function accentGrounds(ink: string, mode: Mode, theme: string): Ground[] {
  const own = (roleOf(ink) as Extract<Role, { is: "accent ink" }>).own ?? []
  return grounds(mode, theme).filter((g) => {
    if (own.includes(g.surface)) return true
    if (["brand-muted", "agent-muted", "brand"].includes(g.surface) || g.surface.startsWith("camp-")) return false
    if (g.state === "rest" || g.state === "hover") return g.surface !== "frame" || g.state === "rest"
    return ["sheet", "raised", "pop", "panel"].includes(g.surface)
  })
}

describe.each(MODES)("%s: every ink reads at AA on every surface", (mode) => {
  it.each(THEMES)("%s", (theme) => {
    const fails: string[] = []
    for (const ink of INKS) {
      const fg = paint(ink, mode)
      for (const g of grounds(mode, theme)) if (contrastRatio(fg, g.rgb) < AA) fails.push(`--${ink} on ${g.name}: ${say(fg, g.rgb)}`)
    }
    for (const ink of ACCENTS) {
      const fg = paint(ink, mode, theme)
      for (const g of accentGrounds(ink, mode, theme)) if (contrastRatio(fg, g.rgb) < AA) fails.push(`--${ink} on ${g.name}: ${say(fg, g.rgb)}`)
    }
    expect(fails).toEqual([])
  })

  it("keeps the tiers in order on every surface: ink, ink-2, ink-3, then ink-4", () => {
    for (const s of ["frame", "sheet", "sunken", "raised", "pop", "panel"]) {
      const bg = paint(s, mode)
      const [a, b, c, d] = ["ink", "ink-2", "ink-3", "ink-4"].map((i) => contrastRatio(paint(i, mode), bg))
      expect(a > b && b > c && c > d, `${s} (${mode}): ${[a, b, c, d].map((x) => x.toFixed(2)).join(" > ")}`).toBe(true)
    }
  })
})

/* ── The sidebar and the tablet rail: the lit frame ──────────────────────── */

type Layer = { radial?: { rx: number; ry: number; cx: number; cy: number }; token: string; alpha: number; stop: number }

/** The campfire glow as .app-frame::before paints it, top layer first. */
function readGlow(mode: Mode): Layer[] {
  const selector = mode === "light" ? ".app-frame::before" : ".dark .app-frame::before"
  let background = ""
  SHEET.walkRules((rule) => {
    if (rule.selector.trim() === selector) rule.walkDecls("background", (d) => void (background = d.value))
  })
  const layers: Layer[] = []
  const rx = /radial-gradient\(\s*(\d+)px\s+(\d+)px\s+at\s+(-?\d+)px\s+(-?\d+)px\s*,\s*rgb\(var\(--([\w-]+)\)\s*\/\s*([\d.]+)\)\s*,\s*transparent\s+([\d.]+)%\s*\)|linear-gradient\(\s*180deg\s*,\s*rgb\(var\(--([\w-]+)\)\s*\/\s*([\d.]+)\)\s*,\s*transparent\s+([\d.]+)%\s*\)/g
  for (const m of background.matchAll(rx)) {
    if (m[1]) layers.push({ radial: { rx: +m[1], ry: +m[2], cx: +m[3], cy: +m[4] }, token: m[5], alpha: +m[6], stop: +m[7] / 100 })
    else layers.push({ token: m[8], alpha: +m[9], stop: +m[10] / 100 })
  }
  if (!layers.length || layers.length !== (background.match(/gradient\(/g) ?? []).length) throw new Error(`can't read the glow on ${selector}: ${background}`)
  return layers
}

const GLOW = { light: readGlow("light"), dark: readGlow("dark") }

let grainImage = ""
SHEET.walkRules((rule) => {
  if (rule.selector.trim() === ".app-frame::after") rule.walkDecls("background-image", (d) => void (grainImage = d.value))
})

/** The grain (.app-frame::after): black noise at --grain-opacity. Multiplied, it darkens by up to that much; screened, black does nothing. */
function grain(c: RGB, mode: Mode): RGB {
  if (!grainImage.includes("values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'")) throw new Error("the grain is no longer black noise: model what it paints")
  const opacity = Number(value("grain-opacity", mode))
  const blend = value("grain-blend", mode)
  if (blend === "screen") return c
  if (blend !== "multiply") throw new Error(`a grain blend this test can't model: ${blend}`)
  const k = 1 - opacity
  return { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k) }
}

/** The frame at (x, y), on a frame `height` tall: its colour, the glow's layers bottom-up, the grain at full strength. */
function litFrame(mode: Mode, theme: string, x: number, y: number, height: number): RGB {
  let c = paint("frame", mode)
  for (const l of [...GLOW[mode]].reverse()) {
    const t = value(l.token, mode, theme).split(/\s+/).map(Number)
    const d = l.radial ? Math.hypot((x - l.radial.cx) / l.radial.rx, (y - l.radial.cy) / l.radial.ry) : y / height
    c = over({ r: t[0], g: t[1], b: t[2] }, d < l.stop ? l.alpha * (1 - d / l.stop) : 0, c)
  }
  return grain(c, mode)
}

/**
 * Where the frame carries words, in the frame's coordinates: the sidebar's,
 * measured at 1440×900 on 13 Oct 2026, and the tablet rail's, from its CSS
 * (10px in, the 44px mark, then 52px cells whose 11px label sits under a
 * 32px capsule; a hover or an open menu tints the capsule, not the label).
 * The glow is strongest at the top left and its second light near the foot,
 * so these are the points it reaches hardest, at several window heights (the
 * wash runs over 55% of the frame, and the second light sits 1000px down).
 * The search pill's words sit on its own 70% white, lighter.
 */
type Scope = ".shell-side" | ".tablet-rail"
const FRAME_TEXT: Array<{ what: string; scope: Scope; x: number; y: (h: number) => number; states: State[] }> = [
  { what: "a nav row's count, from the first row", scope: ".shell-side", x: 200, y: () => 104, states: ["rest", "hover"] },
  { what: "a nav row's label (hover lifts it to ink)", scope: ".shell-side", x: 40, y: () => 104, states: ["rest"] },
  { what: "the More row and its count, open while its menu is", scope: ".shell-side", x: 40, y: () => 229, states: ["rest", "hover", "press"] },
  { what: "a section header", scope: ".shell-side", x: 16, y: () => 274, states: ["rest"] },
  { what: "the foot's status line", scope: ".shell-side", x: 52, y: (h) => h - 29, states: ["rest"] },
  { what: "the tablet rail's first label, under the mark", scope: ".tablet-rail", x: 17, y: () => 100, states: ["rest"] },
  { what: "the tablet rail's Search label, above your face", scope: ".tablet-rail", x: 55, y: (h) => h - 74, states: ["rest"] },
]
const HEIGHTS = [768, 800, 900, 1024, 1029, 1074, 1080, 1366, 1440]

/** The ink a lit region paints for a token: in light the sidebar and the tablet rail read their ink-3 as ink-2 (globals.css). */
function frameInk(name: string, mode: Mode, scope: Scope): RGB {
  const scoped = props(SHEET, `${mode === "light" ? ":root:not(.dark)" : ".dark"} ${scope}`).get(name)
  const ref = scoped ? /^var\(--([\w-]+)\)$/.exec(scoped) : null
  return ref ? paint(ref[1], mode) : paint(name, mode)
}

describe.each(MODES)("%s: the words on the lit frame read at AA", (mode) => {
  it.each(THEMES)("%s", (theme) => {
    const inks = new Map(FRAME_TEXT.map((s) => s.scope).flatMap((scope) => INKS.map((ink) => [`${scope} ${ink}`, frameInk(ink, mode, scope)] as const)))
    const fails: string[] = []
    for (const spot of FRAME_TEXT) {
      for (const h of HEIGHTS) {
        const lit = litFrame(mode, theme, spot.x, spot.y(h), h)
        for (const state of spot.states) {
          const bg = under(state, lit, mode)
          for (const ink of INKS) {
            const fg = inks.get(`${spot.scope} ${ink}`)!
            if (contrastRatio(fg, bg) < AA) fails.push(`${spot.what} (${state}, ${h}px tall): --${ink} as ${spot.scope} paints it, ${say(fg, bg)}`)
          }
        }
      }
    }
    expect(fails).toEqual([])
  })
})

describe("the paper copies carry the light tokens", () => {
  // An invoice, a printed doc and a part of a page printed alone (the
  // calendar's view) are paper in any theme, so they restate the light
  // values; a value moved on :root has to move here too.
  const papers: Array<[string, Root, string]> = [
    ["app/globals.css", SHEET, ".invoice-paper"],
    ["app/globals.css, printed alone", SHEET, "html[data-print-path]"],
    ["components/minimal-tiptap/styles/partials/print.css", postcss.parse(readFileSync(join(REPO, "components/minimal-tiptap/styles/partials/print.css"), "utf8")), ":root:has(.doc-scroll [data-doc-title])"],
  ]
  it.each(papers)("%s", (_file, root, selector) => {
    const paper = props(root, selector)
    expect(paper.size).toBeGreaterThan(0)
    // The neutrals, and every area's hue a paper copy restates (the calendar
    // prints its events in their light tints, in any theme).
    const hues = [...paper.keys()].filter((n) => /^(camp-|agent)/.test(n))
    for (const name of ["sheet", "raised", "sunken", "ink", "ink-2", "ink-3", ...hues]) {
      const v = paper.get(name)
      if (v) expect(v.toUpperCase(), `--${name} on ${selector}`).toBe((LIGHT.get(name) ?? "").toUpperCase())
    }
  })
})

/* ── ink-4 is never text anyone reads ────────────────────────────────────── */

/**
 * Every place ink-4 colours something in app/ and components/ that a person
 * might take for text: a text-ink-4 class (any variant), a text-[var(--ink-4)]
 * value, an inline color, or a CSS color. Each has to be one of these, with
 * why. `match` is a piece of the line (TS/TSX) or of the rule's selector (CSS).
 * `arrives` names a branch that brings the use with it and was unmerged when
 * D-SD4 landed: the entry may match nothing until it merges.
 */
type Use = { file: string; match: string; why: string; arrives?: string }

const DECORATIVE: Use[] = [
  { file: "app/app/tables/[table-id]/page.tsx", match: "<ChevronRight className=\"hidden size-3.5 shrink-0 text-ink-4", why: "a chevron, aria-hidden" },
  { file: "app/globals.css", match: ".shell-row[aria-disabled=\"true\"]", why: "a disabled sidebar row" },
  { file: "app/globals.css", match: ".split-handle-glyph", why: "a split pane's grip glyph, aria-hidden: it says the bar drags, and the bar's name says what it is" },
  { file: "components/ai/aiActivityFeedRow.tsx", match: "place-items-center text-ink-4 opacity-0", why: "the chain check's glyph while it runs, aria-hidden; the row's words carry the result" },
  { file: "components/ai/aiActivityFeedRow.tsx", match: "<ChevronDown aria-hidden", why: "a chevron, aria-hidden" },
  { file: "components/board/excalidrawTheme.css", match: "[disabled] .ToolIcon__icon", why: "a disabled tool's icon" },
  { file: "components/booking/BookingFlow.tsx", match: "!loading && !open && \"cursor-default font-normal text-ink-4\"", why: "a day with no times: the booking page's disabled day (its label says so)" },
  { file: "components/calendar/bookingEditor.tsx", match: ": \"text-ink-4\")}", why: "a closed day in the booking page's preview, drawn as the page draws it: disabled" },
  { file: "components/calendar/calendarsPopover.tsx", match: "<ChevronRight className=\"size-3.5 text-ink-4\" aria-hidden=\"true\" />", why: "a chevron, aria-hidden" },
  { file: "components/doc/docPreview.tsx", match: "justify-center text-ink-4\" aria-hidden=\"true\"", why: "a doc preview's placeholder glyph" },
  { file: "components/home/GlanceLine.tsx", match: "<span className=\"text-ink-4\"> ·</span>", why: "a separator dot, kept with the fact before it" },
  { file: "components/home/needsRow.tsx", match: "<span className=\"text-ink-4\">·</span>", why: "a separator dot" },
  { file: "components/message/sendStatus.tsx", match: "\"shrink-0 text-ink-4\"", why: "the clock while a message sends, aria-hidden; the word Sending… joins it at 2 s" },
  { file: "components/minimal-tiptap/styles/index.css", match: ".block-handle-btn", why: "the block handle's + and ⋮⋮ glyphs; hover lifts them to ink-2" },
  { file: "components/myTask/myTaskDesktop.tsx", match: "<span aria-hidden=\"true\" className=\"text-ink-4\">·</span>", why: "a separator dot" },
  { file: "components/project/ProjectGlanceLine.tsx", match: "<span aria-hidden=\"true\" className=\"text-ink-4\">·</span>", why: "a separator dot" },
  { file: "components/project/ProjectsOverview.tsx", match: "<span className=\"text-ink-4\"> · </span>", why: "a separator dot" },
  { file: "components/project/ProjectsOverview.tsx", match: "text-ink-4\">–</span>", why: "an empty date's dash" },
  { file: "components/project/ProjectsOverview.tsx", match: "<span className=\"px-1.5 text-ink-4\">·</span>", why: "a separator dot" },
  { file: "components/project/ProjectsOverview.tsx", match: "before={<span aria-hidden className=\"text-ink-4\">·</span>}", why: "a separator dot, aria-hidden, before a phone row's forecast" },
  { file: "components/project/timeline/UnscheduledPanel.tsx", match: "<GripVertical aria-hidden", why: "a drag grip" },
  { file: "components/rightPanel/RightPanelTaskHeader.tsx", match: "<ChevronRight aria-hidden className=\"size-3.5 shrink-0 text-ink-4\" />", why: "the task path's separator chevron, aria-hidden" },
  { file: "components/rightPanel/RightPanelTaskHeader.tsx", match: "<ChevronRight aria-hidden className={cn(\"size-3.5 shrink-0 text-ink-4\", parent && ", why: "the separator chevron before the key, aria-hidden" },
  { file: "components/search/searchResultRow.tsx", match: "const dot = <span className=\"text-ink-4\"> · </span>", why: "a separator dot" },
  { file: "components/fields/OptionsEditor.tsx", match: "<GripVertical className=\"size-3.5 text-ink-4\" />", why: "an option's drag grip, in its aria-hidden handle" },
  { file: "components/table/TableRowList.tsx", match: "iconMarkup(ChevronRight, { className: \"size-4 shrink-0 text-ink-4\", \"aria-hidden\": true })", why: "a chevron, aria-hidden" },
  { file: "components/task/panelParts.tsx", match: "<span className=\"text-ink-4\" aria-hidden>→</span>", why: "the arrow between two dates" },
  { file: "components/ui/FloatingBar.tsx", match: "disabled:text-ink-4", why: "a disabled action" },
  { file: "components/ui/calendar.tsx", match: "day_disabled: \"text-ink-4", why: "a day that can't be picked" },
  { file: "components/ui/dayCell.tsx", match: "disabled && \"pointer-events-none text-ink-4\"", why: "a day that can't be picked" },
  { file: "components/ui/settingsPage.tsx", match: "<span aria-hidden=\"true\" className=\"text-ink-4\">/</span>", why: "a breadcrumb separator" },
  { file: "components/calendar/quickCreateCard.tsx", match: "<span aria-hidden=\"true\" className=\"text-ink-4\">·</span>", why: "a separator dot", arrives: "calfix-fe" },
  { file: "components/docEditor/Breadcrumbs.tsx", match: "<ChevronRight aria-hidden=\"true\" className=\"size-3", why: "a breadcrumb chevron, aria-hidden", arrives: "docs-b6-fe" },
  { file: "components/docFiles/FolderView.tsx", match: "<ChevronRight className=\"size-3.5 shrink-0 text-ink-4 max-sm:hidden\" aria-hidden=\"true\" />", why: "a folder's way down: a breadcrumb chevron, aria-hidden" },
  { file: "components/docFiles/FolderView.tsx", match: "<ChevronRight className=\"size-3.5 shrink-0 text-ink-4\" aria-hidden=\"true\" />", why: "a folder's way down: the chevron before its own name, aria-hidden" },
  { file: "components/minimal-tiptap/extensions/web-embed/web-embed-view.tsx", match: "cursor-ns-resize items-center justify-center rounded-md text-ink-4", why: "an embed's resize grip; hover lifts it to ink-2", arrives: "docs-b4-fe" },
]

const TEXT_INK_4 = [/(?<![\w-])text-ink-4(?![\w-])/, /text-\[(?:color:)?var\(--ink-4\)\]/, /(?<![\w-])color:\s*["'`]var\(--ink-4\)["'`]/, /(?<![\w-])(?:color|-webkit-text-fill-color)\s*:\s*var\(--ink-4\)/]

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(tsx?|css)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
  }
  return out
}

/** Every text use of ink-4: the line it is on (TS/TSX), or the rule's selector (CSS). */
function inkFourText(): Array<{ file: string; where: string; at: string }> {
  const found: Array<{ file: string; where: string; at: string }> = []
  for (const path of ["app", "components"].flatMap((d) => sources(join(REPO, d)))) {
    const file = relative(REPO, path)
    const text = readFileSync(path, "utf8")
    if (path.endsWith(".css")) {
      postcss.parse(text).walkDecls(/^(color|-webkit-text-fill-color)$/, (d) => {
        if (/var\(--ink-4\)/.test(d.value)) found.push({ file, where: (d.parent as { selector?: string } | undefined)?.selector ?? "", at: `${file}:${d.source?.start?.line}` })
      })
    } else {
      text.split("\n").forEach((line, i) => {
        if (TEXT_INK_4.some((re) => re.test(line))) found.push({ file, where: line, at: `${file}:${i + 1}` })
      })
    }
  }
  return found
}

describe("ink-4 is decoration, never text anyone has to read", () => {
  const found = inkFourText()
  const listed = DECORATIVE
  const covers = (u: Use, f: { file: string; where: string }) => u.file === f.file && f.where.includes(u.match)

  it("finds the uses it checks", () => {
    expect(found.length).toBeGreaterThan(10)
  })

  it("has a reason for every one", () => {
    const loose = found.filter((f) => !listed.some((u) => covers(u, f))).map((f) => `${f.at}: ${f.where.trim().slice(0, 120)}`)
    expect(
      loose,
      "ink-4 on text: use ink-3 for anything a person reads (D-SD4). A separator, chevron, disabled state or placeholder glyph goes in DECORATIVE in app/inkContrast.test.ts, with why",
    ).toEqual([])
  })

  it("lists only uses that are still there", () => {
    const stale = listed.filter((u) => !u.arrives && !found.some((f) => covers(u, f))).map((u) => `${u.file}: ${u.match}`)
    expect(stale, "these entries match nothing now: delete them").toEqual([])
  })
})
