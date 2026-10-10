"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { VALID_COLOR_THEMES } from "@/components/activeTheme/activeTheme"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Arc,
  HUE_CLASS,
  IdentityMark,
  Orbit,
  ProgressRing,
  Rings,
  SPOTS,
  Spark,
  Tile,
  cx,
} from "@/components/ui/graphics"
import { PageHeader } from "@/components/ui/pageHeader"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SettingsSection } from "@/components/ui/settingsSection"
import { Switch } from "@/components/ui/switch"
import { CAMP_HUES, hueFor } from "@/lib/campHue"
import { celebrate, springPop } from "@/lib/celebrate"
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Hash,
  Inbox,
  MessageSquare,
  Plug,
  Users,
} from "@/lib/icons"

/** The demo's cast first, then a few more, so the avatar row is real. */
const PEOPLE = ["Sam Rivera", "Maya Chen", "Jonas Weber", "Lena Fischer", "Kofi Mensah", "Priya Shah", "Tomás Ortega", "Hana Sato"]
const CHANNELS = ["#engineering", "#general", "#acme", "#design", "#launch", "#support"]
const ICONS = [MessageSquare, FileText, CalendarDays, Users, Inbox, Plug]

/**
 * A theme's tokens, scoped to one small frame: the indirections body makes
 * for the whole page (globals.css), made again here, so each frame shows its
 * own theme while the page keeps the one you chose.
 */
const FRAME: CSSProperties = {
  ["--primary" as string]: "var(--brand-text)",
  ["--primary-foreground" as string]: "var(--brand-foreground)",
  ["--ring" as string]: "var(--brand)",
  ["--canvas" as string]: "var(--brand-wash)",
  ["--sidebar" as string]: "var(--brand-wash)",
}

/** The camp tokens as the current theme resolves them, re-read when it changes. */
function useTokens(names: string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({})
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement)
      setValues(Object.fromEntries(names.map((n) => [n, style.getPropertyValue(`--${n}`).trim().toUpperCase()])))
    }
    read()
    const watch = new MutationObserver(read)
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => watch.disconnect()
    // The names are a constant list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return values
}

function Swatch({ className, value, label }: { className: string; value?: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className={cx("h-10 rounded-md border border-border", className)} />
      <p className="text-2xs text-muted-foreground">
        {label} <span className="font-mono">{value}</span>
      </p>
    </div>
  )
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="text-2xs text-muted-foreground">{children}</p>
}

export function PlayfulShowcase() {
  const tokens = useTokens(CAMP_HUES.flatMap((h) => [`camp-${h}`, `camp-${h}-tint`, `camp-${h}-ink`]))
  const [done, setDone] = useState(false)
  const checkRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1040px] space-y-10 px-4 py-8 md:px-8">
        <PageHeader eyebrow="Design system" title="The playful layer">
          Camp hues, identity marks, the ring motif, spot illustrations and motion, in the theme you are in.
          Switch light and dark, or a colour theme, to see each.
        </PageHeader>

        <SettingsSection
          title="Camp palette"
          description="Six identity hues in three cuts. Strong for marks, tint for grounds, ink for text on its tint."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAMP_HUES.map((h) => (
              <div key={h} className={cx(HUE_CLASS[h], "space-y-3 rounded-lg border border-border p-4")}>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium capitalize">{h}</p>
                  <span className="rounded-sm bg-hue-tint px-1.5 py-0.5 text-xs font-medium text-hue-ink">Ink on tint</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Swatch className="bg-hue" label="Strong" value={tokens[`camp-${h}`]} />
                  <Swatch className="bg-hue-tint" label="Tint" value={tokens[`camp-${h}-tint`]} />
                  <Swatch className="bg-hue-ink" label="Ink" value={tokens[`camp-${h}-ink`]} />
                </div>
              </div>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Identity"
          description="Everyone and everything gets a stable hue from its id (hueFor). A colour the owner picked wins."
        >
          <div className="space-y-5 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              {PEOPLE.map((name) => (
                <span key={name} title={name}>
                  <IdentityMark variant="avatar" id={name} label={name} size={32} />
                </span>
              ))}
              <span className="ml-2 flex items-center gap-1">
                {PEOPLE.slice(0, 4).map((name) => (
                  <IdentityMark key={name} variant="avatar" id={name} label={name} size={20} />
                ))}
              </span>
            </div>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {CHANNELS.map((c) => (
                <div key={c} className="flex items-center gap-2 text-sm">
                  <span className={cx(HUE_CLASS[hueFor(c)], "text-hue")}>
                    <Hash className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span>{c.slice(1)}</span>
                  <span className="ml-auto text-2xs text-muted-foreground">{hueFor(c)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {CAMP_HUES.map((h, i) => {
                const Icon = ICONS[i]
                return (
                  <div key={h} className="flex items-center gap-2">
                    <IdentityMark hue={h} />
                    <IdentityMark hue={h} variant="square" />
                    <IdentityMark hue={h} variant="tile" icon={<Icon />} />
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {CAMP_HUES.map((h) => (
                <span key={h} className={cx(HUE_CLASS[h], "rounded-sm bg-hue-tint px-1.5 py-0.5 text-xs font-medium text-hue-ink")}>
                  {h === "sky" ? "Design" : h === "moss" ? "Shipped" : h === "sun" ? "Launch" : h === "dusk" ? "Research" : h === "berry" ? "Client" : "Ops"}
                </span>
              ))}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="The ring motif" description="The logo's ring, extended: rings, a dotted orbit, an arc, a spark and the tile.">
          <div className="grid grid-cols-2 items-end gap-6 rounded-lg border border-border p-4 sm:grid-cols-4 lg:grid-cols-6">
            <div className="space-y-2">
              <Rings hue="sky" size={96} />
              <Caption>Rings, sky</Caption>
            </div>
            <div className="space-y-2 text-muted-foreground">
              <Rings size={96} count={2} />
              <Caption>Rings, text colour</Caption>
            </div>
            <div className="space-y-2 text-muted-foreground">
              <Orbit size={96} />
              <Caption>Orbit</Caption>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Arc hue="dusk" sweep={0.3} start={30} size={44} />
                <Arc hue="lake" sweep={0.7} size={44} track />
              </div>
              <Caption>Arc</Caption>
            </div>
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <Spark hue="sun" size={20} />
                <Spark hue="berry" size={14} />
                <Spark hue="sky" size={10} />
              </div>
              <Caption>Spark</Caption>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Tile hue="moss" size="lg">
                  <CheckCircle2 />
                </Tile>
                <Tile hue="sun">
                  <Plug />
                </Tile>
                <Tile hue="berry" size="sm">
                  <Inbox />
                </Tile>
              </div>
              <Caption>Tile</Caption>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Spot illustrations" description="For empty states, onboarding, errors and the 404. Under 600 bytes each, no image files.">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(SPOTS).map(([name, Spot]) => (
              <div key={name} className="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
                <Spot />
                <Caption>{name}</Caption>
              </div>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Motion"
          description="Checks and toggles spring, a card lifts a pixel, a finished task bursts. All of it stands still with reduced motion."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    if (!done) celebrate(e.currentTarget)
                    setDone((d) => !d)
                  }}
                  aria-label={done ? "Mark as incomplete" : "Mark as complete"}
                  className="flex h-6 w-6 items-center justify-center"
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 animate-spring text-success-ink" />
                  ) : (
                    <span className="block h-5 w-5 rounded-md border-2 border-muted-foreground/40" />
                  )}
                </button>
                <span className="text-sm">Post the load test numbers</span>
                <span className="ml-auto text-2xs text-muted-foreground">Complete it to celebrate</span>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  ref={checkRef}
                  aria-label="Springy check"
                  onCheckedChange={(on) => on && springPop(checkRef.current)}
                />
                <span className="text-sm">A check that springs</span>
              </div>
              <div className="flex items-center gap-3">
                <Switch aria-label="Springy toggle" defaultChecked />
                <span className="text-sm">A toggle whose thumb lands with a slight overshoot</span>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={(e) => celebrate(e.currentTarget)}>
                  Celebrate
                </Button>
                <span className="text-2xs text-muted-foreground">For a first message, an import, a checklist done</span>
              </div>
            </div>
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-4">
                <ProgressRing value={0} label="Not started" />
                <ProgressRing value={35} label="35 percent" />
                <ProgressRing value={70} size={40} label="70 percent">
                  70
                </ProgressRing>
                <ProgressRing value={100} label="Done" />
              </div>
              <Progress value={62} aria-label="62 percent" />
              <a
                href="#motion"
                onClick={(e) => e.preventDefault()}
                className="hover-lift block rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm font-medium">A card that lifts</p>
                <p className="text-xs text-muted-foreground">1px and a little shadow, on pointers that hover.</p>
              </a>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Colour themes"
          description="Each theme washes the frame and colours what carries state: the current place, switches, checks, progress."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {VALID_COLOR_THEMES.map((t) => (
              <div key={t} className={`theme-${t}`} style={FRAME}>
                <div className="space-y-1 rounded-lg border border-border bg-canvas p-2">
                  <p className="px-2 pb-1 text-2xs capitalize text-muted-foreground">{t}</p>
                  <div className="nav-active flex h-7 items-center gap-2 rounded-md px-2 text-sm font-medium">
                    <Hash className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    engineering
                  </div>
                  <div className="nav-idle flex h-7 items-center gap-2 rounded-md px-2 text-sm">
                    <Hash className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    general
                  </div>
                  <div className="flex items-center gap-3 px-2 pt-2">
                    <Switch aria-label={`${t} switch`} defaultChecked />
                    <Checkbox aria-label={`${t} check`} defaultChecked />
                    <RadioGroup defaultValue="a" className="flex">
                      <RadioGroupItem value="a" aria-label={`${t} choice`} />
                    </RadioGroup>
                    <Progress value={60} aria-label={`${t} progress`} className="h-1.5 flex-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-brand-wash p-4">
            <p className="text-sm font-medium">bg-brand-wash</p>
            <p className="text-xs text-muted-foreground">A band in the theme&apos;s wash, for a Home greeting.</p>
          </div>
        </SettingsSection>
      </div>
    </div>
  )
}
