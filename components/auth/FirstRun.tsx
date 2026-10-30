"use client"

// The first run's steps 2 and 3 (design v3, admin.md E2 and E3), after the
// first admin's account (step 1, app/admin-setup). Step 2 picks the camp's
// colour through the existing theme provider (per person, in this browser: no
// API); step 3 invites the team with the invitation endpoint the admin's
// invite dialog uses.

import * as React from "react"
import { useState } from "react"
import { useTheme } from "next-themes"
import { Check, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { useThemeConfig } from "@/components/activeTheme/activeTheme"
import { AuthAvatar, AuthHeading, StepPill, authControlXl } from "@/components/auth/AuthShell"
import { addChips, type InviteChip } from "@/lib/auth/inviteChips"
import { invite } from "@/services/invitationService"
import { cn } from "@/lib/utils/helpers/cn"

/** The nine colours offered first, by the theme provider's names. */
export const FIRST_RUN_THEMES = [
  { value: "onecamp", name: "Camp" },
  { value: "blue", name: "Blue" },
  { value: "green", name: "Green" },
  { value: "violet", name: "Violet" },
  { value: "rose", name: "Rose" },
  { value: "amber", name: "Amber" },
  { value: "teal", name: "Teal" },
  { value: "orange", name: "Orange" },
  { value: "slate", name: "Slate" },
] as const

/** The theme provider when the page has one; a page rendered alone (a test, a preview) falls back to storage. */
function useThemeChoice(): { activeTheme: string; setActiveTheme: (t: string) => void } {
  let config: ReturnType<typeof useThemeConfig> | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- always called, in the same order
    config = useThemeConfig()
  } catch {
    config = null
  }
  if (config) return config
  return {
    activeTheme: "onecamp",
    setActiveTheme: (t: string) => {
      try {
        localStorage.setItem("onecamp-theme-color", t)
      } catch {
        /* nowhere to keep it */
      }
    },
  }
}


/**
 * Step 2, "Make it yours": a 3×3 grid of 72px mini camps (each with its
 * theme's glow, the ring and a primary bar in its accent). Hovering one
 * previews it on the whole page (`onPreview`); choosing one keeps it.
 * Light, Dark or Device above. Skip leaves the default as it was.
 */
export function ThemeStep({ onPreview, onDone }: { onPreview: (theme: string | null) => void; onDone: () => void }) {
  const { activeTheme, setActiveTheme } = useThemeChoice()
  const { theme, setTheme } = useTheme()
  const [picked, setPicked] = useState<string | null>(null)
  const mode = theme === "light" || theme === "dark" ? theme : "system"
  return (
    <div className="auth-fade-in">
      <AuthHeading display kicker={<StepPill step={2} label="Make it yours" />} title="Pick your camp's colour">
        It colours your buttons, your focus and the light behind the app. Everyone picks their own later.
      </AuthHeading>
      <div className="mb-6 flex justify-center">
        <SegmentedControl
          aria-label="Light or dark"
          value={mode}
          onValueChange={(v) => setTheme(v)}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "Device" },
          ]}
        />
      </div>
      <div role="radiogroup" aria-label="Colour" className="auth-swatches" onMouseLeave={() => onPreview(null)}>
        {FIRST_RUN_THEMES.map((t) => {
          const selected = (picked ?? activeTheme) === t.value
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className="auth-swatch"
              data-swatch={t.value}
              onMouseEnter={() => onPreview(t.value)}
              onFocus={() => onPreview(t.value)}
              onClick={() => {
                setPicked(t.value)
                setActiveTheme(t.value)
              }}
            >
              <span className={cn("auth-swatch-face", `theme-${t.value}`)} aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" className="relative -mt-3">
                  <circle cx="12" cy="12" r="8" fill="none" strokeWidth="4" stroke="url(#swatch-ring)" />
                </svg>
                <span className="auth-swatch-bar" />
                {selected && (
                  <span className="auth-swatch-check">
                    <Check aria-hidden="true" />
                  </span>
                )}
              </span>
              {t.name}
            </button>
          )
        })}
      </div>
      {/* One gradient for every swatch's ring: the logo's own. */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <linearGradient id="swatch-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF8A00" />
            <stop offset="1" stopColor="#FF3D00" />
          </linearGradient>
        </defs>
      </svg>
      <div className="mt-8 space-y-2">
        <Button size="lg" className={authControlXl} onClick={onDone}>
          Continue
        </Button>
        <Button variant="ghost" size="lg" className="h-11 w-full md:h-10" onClick={onDone}>
          Skip
        </Button>
      </div>
    </div>
  )
}

/**
 * Step 3, "Who's coming?": addresses as chips (a pasted list splits into
 * one per address), each valid one joining the camp on the right as a
 * gradient avatar (`onPeople`). Sends one invitation each through the admin's
 * invitation endpoint, then opens OneCamp.
 */
export function TeamStep({ onPeople, onFinish }: { onPeople: (emails: string[]) => void; onFinish: () => void }) {
  const [chips, setChips] = useState<InviteChip[]>([])
  const [draft, setDraft] = useState("")
  const [armed, setArmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [failures, setFailures] = useState<Array<{ email: string; msg: string }>>([])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const valid = chips.filter((c) => c.valid)

  const update = (next: InviteChip[]) => {
    setChips(next)
    onPeople(next.filter((c) => c.valid).map((c) => c.email))
  }
  const commit = (text: string) => {
    if (!text.trim()) return
    update(addChips(chips, text))
    setDraft("")
  }

  const send = async () => {
    const pending = draft.trim() ? addChips(chips, draft) : chips
    if (pending !== chips) update(pending)
    setDraft("")
    const toSend = pending.filter((c) => c.valid)
    if (toSend.length === 0) {
      onFinish()
      return
    }
    setSending(true)
    const failed: Array<{ email: string; msg: string }> = []
    for (const c of toSend) {
      const outcome = await invite(c.email, true)
      if (!outcome.ok) failed.push({ email: c.email, msg: outcome.msg })
    }
    setSending(false)
    if (failed.length === 0) onFinish()
    else setFailures(failed)
  }

  const label = valid.length === 0 ? "Open OneCamp" : `Send ${valid.length} ${valid.length === 1 ? "invitation" : "invitations"} and open OneCamp`

  return (
    <div className="auth-fade-in">
      <AuthHeading display kicker={<StepPill step={3} label="Your team" />} title="Who's coming?">
        Add the people you work with. Each gets an email with a link to join.
      </AuthHeading>
      <label htmlFor="first-run-emails" className="auth-label mb-2 block">
        Email addresses
      </label>
      <div className="auth-chipfield" onClick={() => inputRef.current?.focus()} data-chip-field="">
        {chips.map((c, i) => (
          <span
            key={c.email}
            className="auth-emailchip"
            data-invalid={c.valid ? undefined : ""}
            data-selected={armed && i === chips.length - 1 ? "" : undefined}
            title={c.valid ? undefined : "This isn't an email address"}
          >
            {c.valid ? <AuthAvatar seed={c.email} size={18} /> : <span aria-hidden="true">!</span>}
            <span translate="no">{c.email}</span>
            <button type="button" aria-label={`Remove ${c.email}`} onClick={() => update(chips.filter((x) => x.email !== c.email))}>
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id="first-run-emails"
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={chips.length ? "" : "name@company.com, another@company.com"}
          value={draft}
          onChange={(e) => {
            setArmed(false)
            const v = e.target.value
            if (/[\s,;]$/.test(v)) commit(v)
            else setDraft(v)
          }}
          onPaste={(e) => {
            e.preventDefault()
            commit(draft + " " + e.clipboardData.getData("text"))
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit(draft)
            } else if (e.key === "Backspace" && draft === "" && chips.length) {
              // First Backspace selects the last chip, a second removes it.
              if (armed) {
                update(chips.slice(0, -1))
                setArmed(false)
              } else setArmed(true)
            }
          }}
        />
      </div>
      <p className="auth-hint mt-2">Paste a whole list: commas, spaces and new lines all split it.</p>
      {failures.length > 0 && (
        <ul className="mt-4 space-y-1" role="alert">
          {failures.map((f) => (
            <li key={f.email} className="auth-field-error">
              <span>
                <span className="font-medium" translate="no">
                  {f.email}
                </span>
                : {f.msg}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 space-y-2">
        <Button size="lg" className={authControlXl} onClick={() => (failures.length ? onFinish() : void send())} busy={sending}>
          {failures.length ? "Open OneCamp" : label}
        </Button>
        {!failures.length && (
          <Button variant="ghost" size="lg" className="h-11 w-full md:h-10" onClick={onFinish}>
            I&apos;ll do this later
          </Button>
        )}
      </div>
    </div>
  )
}
