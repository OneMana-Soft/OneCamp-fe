# The OneCamp design system

One system across three codebases: the product (`onecamp-fe`), the customer build
(`onecamp-fe-public`), and the storefront (`onemana-frontend`). A visitor who
buys on the storefront and lands in the product should not be able to tell they
changed companies.

These are rules, not suggestions. Where a rule exists, following it is not a
matter of taste, and departing from it should be a deliberate act with a reason
written next to it.

## Colour

**One accent. Everything else is a tinted neutral.**

| Token | Light | Dark |
|---|---|---|
| brand | `oklch(0.55 0.16 45)` · `rgb(185 74 0)` | `oklch(0.74 0.14 45)` · `rgb(242 140 92)` |

The dark value is a lighter, less saturated cut of the same hue, not the light
value reused: the orange that reads as confident on paper reads as mud on a dark
ground.

**Neutrals carry a trace of the brand's hue, never zero chroma.** Around 0.005
chroma at hue 70 to 85. That is far too little to read as orange and exactly
enough that the greys look chosen rather than inherited. `oklch(L 0 0)` is the
shadcn default and the single clearest sign nobody made a decision.

**Colour that carries meaning comes from a token**: `success`, `warning`, `info`,
`destructive`. If a colour is not carrying meaning it should be neutral. Never a
raw Tailwind hue.

**Every pair is measured, not eyeballed.** OKLCH keeps lightness perceptually
even, which is what makes a tinted ramp possible, and it also means you cannot
read a contrast ratio off the tokens by eye. The brand at L 0.58 looked right and
scored 4.43 against its own foreground, which fails AA. `paletteContrast.test.ts`
checks every pair in both modes and every selectable accent.

## Type

- **Display**: Bricolage Grotesque, 600 and 700, headings and product moments only.
- **Text**: Inter, everything dense. It is genuinely the right tool at 11px.
- **Mono**: IBM Plex Mono / JetBrains Mono, for data, timestamps, identifiers and eyebrows.

Headings take the display face by default rather than per component, because
"which face is a heading" is a system decision and hundreds of files cannot each
be trusted to remember it.

**Use the scale.** `text-3xs` (10px, the floor) through the named steps. An
arbitrary `text-[13px]` is a size nobody chose; the guard's baseline is 0 in the
public build and should stay there.

## Layout and chrome

**Quiet chrome, higher density.** Hierarchy comes from type weight and spacing,
not from boxes. Shadows are for things that genuinely float, which is popovers
and dialogs. Everything else gets a hairline or nothing.

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

## Copy

Words are design material. Name things as a person recognises them. Say what a
control does, then confirm it happened. Errors explain what went wrong and how to
fix it.

**Say what is not true, too.** The documents in this project name their own gaps,
and that is why they are believed. A compliance claim that overstates itself is
worth less than none, and the same is true of a marketing page: acknowledging the
operational cost of self-hosting is what makes the rest of the argument credible.

**No emoji as decoration.**
