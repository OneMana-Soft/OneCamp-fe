# The OneCamp design system

One system across three codebases: the product (`onecamp-fe`), the customer build
(`onecamp-fe-public`), and the storefront (`onemana-frontend`). A visitor who
buys on the storefront and lands in the product should not be able to tell they
changed companies.

These are rules, not suggestions. Where a rule exists, following it is not a
matter of taste, and departing from it should be a deliberate act with a reason
written next to it.

## Colour

Design v3 (11 Oct 2026, `release-1010/design/DESIGN_V3.md`): precise and
warm. The values are pinned in both repos by `sharedTokens.test.ts`.

**Five surfaces, four inks, alpha lines.**

| Token | Light | Dark | Use |
|---|---|---|---|
| `frame` (canvas, sidebar) | `#F3F4F6` | `#0B0C0E` | the sidebar and the gutter round the sheet |
| `sheet` (background) | `#FFFFFF` | `#131416` | the main panel |
| `sunken` (muted) | `#F8F9FA` | `#0F1012` | group headers, columns, code, comment cards |
| `raised` (card) | `#FFFFFF` | `#1B1C1F` | cards, inputs, secondary buttons, the selected nav chip |
| `pop` (popover) | `#FFFFFF` | `#1F2024` | menus, popovers, floating toolbars |
| `ink` / `ink-2` / `ink-3` / `ink-4` | `#16171B` / `#5B5D65` / `#8A8C92` / `#B9BBC0` | `#EEEEF0` / `#A8ABB1` / `#72747B` / `#4A4C52` | text, secondary, timestamps and idle icons (never sentences), disabled |
| `line` / `line-2` / `line-3` | ink at 7.5 / 12 / 18% | white at 6.5 / 10 / 16% | hairlines, rings, unchecked boxes |
| `hover` / `press` / `sel` | ink at 4 / 7 / 5.5% | white at 4 / 7 / 6% | overlays that read on any surface |

The shadcn names are aliases of these (`--background: var(--sheet)`), so a
component that says `bg-background` paints v3.

**The theme is light, not tint.** Each theme sets the accent and a campfire
glow (`--glow`, `--glow2`) that the frame (`.app-frame`) paints behind the
workspace mark, with a 3.5% grain. The neutrals stay cool graphite in every
theme (`paletteContrast.test.ts` fails on a warm drift; `glowHue.test.ts`
holds each glow to its accent's hue). The flat warm wash is retired.

**The accent budget: 2% of a view.** The one primary button, the selected nav
icon, mention and DM badges, the focus ring, the new-messages line, your own
reactions, progress, the today ring and links. Never headings, eyebrows,
borders at rest or illustration fills (but one spark). `--brand-muted` is the
ground for "this is about you" only.

**Colour is a noun.** The camp hues (sun, moss, lake, sky, dusk, berry) carry
identity and status only: a person's avatar (the saturated avatar cut, a1 to
a2, white initials), a project's tile, a calendar's bar, a label's 6px dot on a
neutral chip, a status glyph. A channel and a doc have no hue. Status colour is
a token (`success`, `warning`, `info`, `destructive`, and their `-ink` cuts),
never a raw hue. Every pair is measured in `paletteContrast.test.ts`.

## Type

**One face: Inter, with its optical sizes.** `font-optical-sizing: auto` gives
each size its own cut; display sizes (28px and up) take opsz 32, which is Inter
Display without a second family. Features `cv11`, `ss01`, `ss03`. Inter Tight
is retired. JetBrains Mono for IDs, keys and code.

**Tracking follows Inter's metrics**, carried by every size step:
`-0.0223 + 0.185 * e^(-0.1745 * px)` em (`tracking.test.ts`). A word gap gives
back what tracking takes (`word-spacing: 0.01em`), and nothing asks for
`optimizeLegibility`, which ran words together on Linux at 1x.

**The app scale** keeps the 14px default: `text-3xs` 11, `text-2xs` 12,
`text-xs` 13, `text-sm` 14, plus v3's roles: `text-body` 15/23 (a message),
`text-body-lg` 16/26 (a doc), `text-heading` 15/20, `text-title-3` 17/24,
`text-title-2` 20/27, `text-title-1` 24/30, `text-display` 30/36,
`text-doc-title` 32/38. Weights: 400 text, 450 `font-book` for list titles,
510 `font-medium` for emphasis, labels and buttons, 590 `font-semibold` for
headings, 600 `font-bold` only from 28px. Never 700.

## Layout and chrome

**Elevation is a material.** Every surface sits on a step of the ladder, a
ring plus drops: `shadow-e1` resting (secondary buttons, inputs, cards),
`shadow-sel` the selected nav chip, `shadow-e2` raised (the composer, a card
under the cursor), `shadow-e3` floating (menus, popovers), `shadow-e4` modal
(dialogs), `shadow-sheet` the main panel. In dark each adds a top highlight.
The primary button carries an inner highlight and a tinted drop
(`shadow-primary`), not a gradient. Nothing else (`shadowTokens.test.ts`).

**Radii from 8px:** 4 kbd (`rounded-xs`), 6 chips (`rounded-sm`), 8 controls,
nav rows and menu items (`rounded-md`), 12 cards, menus and the sheet
(`rounded-lg`), 16 dialogs (`rounded-2xl`); the storefront's canvas is 20.
Concentric: a 4px-padded r12 menu has r8 items.

**Do not use a grid of identical cards with an icon chip on each.** This is the
most recognisable shape on the AI-built web and it was in three sections of the
storefront. Ask what the content actually is:

| The content is | The form is |
|---|---|
| Claims, each with a mechanism behind it | A numbered specification (`GuaranteeList`) |
| An enumeration answering "does it have X" | A scannable index (`ModuleIndex`) |
| A list somebody checks off | A checklist with the group in the margin (`ControlIndex`) |
| Evidence for a claim | The artefact itself. Show the record, do not describe it. |

**Icons must carry information.** A shield beside "an agent can only do what its
author could" says nothing the sentence has not already said. Twelve chips in
twelve colours assigned by position are decoration wearing the costume of
meaning.

**The app frame is a sheet on a lit frame.** The sidebar sits on the frame
(`.app-frame`: graphite, the theme's glow, grain); the page is one sheet
(`.app-sheet`) at r12 and `shadow-sheet`, the brightest thing on screen.

**The current place is a raised chip** (`.nav-active`: the raised surface at
`e-sel`, ink at 510, its icon in the accent, filled where the shape allows).
Idle rows are ink-2 with ink-3 icons and the alpha hover (`.nav-idle`). Group
labels are sentence case, never uppercase.

**Every page opens with `PageHeader`.** A quiet kicker (13px muted, sentence case, never mono) that places the page
(today's date, "Assigned to you", "Project · Launch"), a title in the display
face, and at most one line underneath that says something the title does not.
"Here is a list of your tasks" and "Manage your team" are not that line; leave
it out.

The one exception is a section whose page is a tabbed list (Channels, Docs,
Projects, Activity, Later): it opens with `SectionTabs`, the section's icon and
name beside its tabs. The tabs already place the page, so a kicker above them
would say it twice.

**Labels come from one place.** An uppercase label is `<Eyebrow>`, or
`cn(eyebrowClass, …)` where the element cannot be a span; a test fails on any
written by hand. A status colour is a token (`success`, `warning`, `info`,
`destructive`); a test fails on a raw status hue anywhere but the files listed as
categorical, where the colour names a thing rather than a state.

**Counts are sentences.** Home says "3 unread channels · 2 notifications · 3
open tasks, 1 overdue" (`GlanceLine`), not four tiles of which three read 0.
Zeros are dropped; all zeros reads "All caught up."

**Lists are rows, not cards.** Monochrome icon, title, meta; hover tints the
row. Unread is weight plus a count in the accent, not a tinted tile.
`categoryColors` is for a type marker where the type is the information (a
search result that could be a doc or a task), never for decorating a list
whose items are all one type.

**Asymmetry over symmetry.** A centred pill badge above a centred headline with
one word in the accent colour above a centred subhead above two centred buttons
is the template. Left-align, and let one side carry the argument.

## Motion

**No infinite decorative loops.** Bob, float, absorb, shimmer, aurora, marquee.
Motion explains a state change or draws the eye once; motion that runs forever is
asserting effort. This site had eight.

**Every animation must be in the `prefers-reduced-motion` block.** It is
thorough here and worth keeping that way; the one animation that was missing from
it was also the one nothing rendered.

**Transition specific properties, not `all`.** `transition-all` animates layout
and causes jank.

**The timings (v3).** Press 90 ms, hover 140, pop 180 (menus and popovers:
opacity, scale .98 to 1, 4px), panel 240 on the in-out curve, the spring 220
(checks and toggles, a slight overshoot), storefront page entrances 320. One
out-curve, `cubic-bezier(.22,1,.36,1)`; the 140 ms default is set in `@theme`,
so a bare `transition-colors` already has it.

## Primitives

**Buttons (v3):** primary (the accent with its highlight), secondary and
outline (raised at e1, e2 on hover), ghost (ink-2), subtle (the hover overlay),
destructive (danger ink on the raised surface), link. Sizes xs 24, sm 28, md
32, lg 40, xl 46; icon buttons 24, 28, 32. Every one takes a 2px accent ring
2px off on keyboard focus.

**Hover is `bg-hover`, press and a menu's highlight `bg-press`** (alphas, so
they read on any surface).

**A field is `<Field label help error>`** around one control: it wires the id,
`aria-describedby` and `aria-invalid`, which Input, Textarea and SelectTrigger
style. Label above, help under, error under that.

**Fields are raised at e1 with no border** (`field-surface`): 32px from md,
44px on a phone, a 1px accent ring and 3px halo on focus, the same in danger
when invalid.

**Controls are 3:1.** A checkbox (16px, r5, moss when checked, springing back
from a press), radio or switch track is drawn in ink-3 against the page, and
its press target reaches 24px.

**Chips, tags, kbd.** A chip is 22px, r6, neutral (`Chip`, `LabelChip`: a dot
for identity, a tint only for meaning); a tag (Agent, Bot, Guest) is 18px, r5,
11/510; kbd is 18px, r4, on the sheet with a line-2 ring.

**Avatars.** A person is the saturated avatar cut with white initials; an
agent a 32% square in the agent gradient with the spark (`AgentAvatar`); a bot
a neutral 32% square (`BotAvatar`). Presence is a 30% dot in `--ok`.

**Icons come from `@/lib/icons`, at one rendered 1.25px stroke** whatever the
size (a non-scaling stroke in globals.css; a `strokeWidth` prop may only say
30 / size, `iconStroke.test.ts`). The status set, the priority bars, the spark
and the progress ring are owned glyphs (`components/ui/graphics`).

## Copy

Words are design material. Name things as a person recognises them. Say what a
control does, then confirm it happened. Errors explain what went wrong and how to
fix it.

**Say what is not true, too.** The documents in this project name their own gaps,
and that is why they are believed. A compliance claim that overstates itself is
worth less than none, and the same is true of a marketing page: acknowledging the
operational cost of self-hosting is what makes the rest of the argument credible.

**No emoji as decoration.**
