"use client"

// The frame every signed-out screen shares: sign in, accept an invitation,
// forgot and reset a password, unsubscribe, connect an agent, sign out and the
// first admin's setup (design v3, admin.md §6).
//
// Two shapes:
//   split    (given `side`) at 1024px and up, columns minmax(480px, 5fr) 7fr:
//            the form column (header, the form 360px wide and vertically
//            centred, the trust line at its foot) and the hero, an inset r24
//            panel. Below 1024px the hero becomes a canvas band at the top.
//   centred  (no side) the header across the top, the form centred, the trust
//            line at the foot, and a soft 120px canvas glow behind the top.
//
// The trust line is the product's claim, Clerk's "Secured by" made true:
// "<this host> · self-hosted, your data stays on this server". The host is
// read from the page's own address, never written down (a literal hostname is
// always somebody else's server: app/noHardcodedDeployment.test.ts).

import * as React from "react"
import { useState } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { AlertCircle, AlertTriangle, ArrowBigUp, Check, Eye, EyeOff, Info, ShieldCheck } from "@/lib/icons"
import { ThemeToggle } from "@/components/themeProvider/theme-toggle"
import { avatarHueClass } from "@/components/ui/graphics"
import { hueFor } from "@/lib/campHue"
import { CampBand, CampCanvas, GradientRing, useHost } from "@/components/auth/CampArt"

/** The product's site (release notes, docs, privacy), when the install names one. */
const productSite = () => (process.env.NEXT_PUBLIC_PRODUCT_SITE || "").replace(/\/$/, "")

/** The logo (the gradient ring at 24) and the product's name. */
function AuthBrand() {
  return (
    <span className="auth-brand" translate="no">
      <GradientRing size={24} />
      OneCamp
    </span>
  )
}

function AuthHeader() {
  return (
    <header className="auth-header">
      <AuthBrand />
      <span className="auth-theme">
        <ThemeToggle />
      </span>
    </header>
  )
}

/** "<host> · self-hosted, your data stays on this server", with Privacy and Help when the install names its site. */
export function TrustLine() {
  const host = useHost()
  const site = productSite()
  return (
    <footer className="auth-trust" data-trust-line="">
      <span className="inline-flex items-start gap-1.5">
      <ShieldCheck aria-hidden="true" className="mt-0.5" />
      <span>
        {host && (
          <>
            <span translate="no">{host}</span>
            {" · "}
          </>
        )}
        self-hosted, your data stays on this server
      </span>
      </span>
      {site && (
        <span className="inline-flex items-center gap-1.5 md:ml-auto">
          <a href={`${site}/privacy`} target="_blank" rel="noopener noreferrer">
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a href={`${site}/docs`} target="_blank" rel="noopener noreferrer">
            Help
          </a>
        </span>
      )}
    </footer>
  )
}

export function AuthShell({
  children,
  className,
  side,
  band,
}: {
  children: React.ReactNode
  className?: string
  /**
   * The hero beside the form from 1024px up (the camp). Decorative, so hidden
   * from screen readers. Without it the page is the centred shape.
   */
  side?: React.ReactNode
  /** The phone's canvas band in the hero's place; the plain camp band when not given. */
  band?: React.ReactNode
}) {
  const main = (
    <main id="main-content" className="auth-main">
      <div className={cn("auth-form", className)}>{children}</div>
    </main>
  )
  if (side) {
    return (
      <div className="auth-page">
        <div className="auth-split">
          <div className="auth-formcol">
            <div aria-hidden="true" className="-mx-4 -mt-4 mb-4 md:-mx-12 md:-mt-8 md:mb-6 lg:hidden">
              {band ?? <CampBand />}
            </div>
            <AuthHeader />
            {main}
            <TrustLine />
          </div>
          <div data-auth-side="" aria-hidden="true" className="auth-hero-col">
            {side}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="auth-page auth-formcol">
      <div className="auth-softband" aria-hidden="true">
        <CampCanvas soft style={{ height: "100%" }} />
      </div>
      <AuthHeader />
      {main}
      <TrustLine />
    </div>
  )
}

/**
 * The page's heading and, when it says something the heading doesn't, one line
 * under it. `display` sets the title in display (30/36, 600): the sign-in, the
 * first run, joining. Otherwise title-1 (24/30, 590). `art` is a picture
 * above the heading, decorative; `kicker` sits above it all (a step pill).
 */
export function AuthHeading({
  title,
  children,
  art,
  display = false,
  kicker,
  center = false,
}: {
  title: React.ReactNode
  children?: React.ReactNode
  art?: React.ReactNode
  display?: boolean
  kicker?: React.ReactNode
  center?: boolean
}) {
  return (
    <div className={center ? "mb-8 text-center" : "mb-8"}>
      {kicker && <div className="mb-5">{kicker}</div>}
      {art && (
        <div data-auth-art="" aria-hidden="true" className={center ? "mb-6 flex justify-center" : "mb-6"}>
          {art}
        </div>
      )}
      {/* Joined by hand: cn drops a text-* size it doesn't know when a text
          colour sits beside it. */}
      <h1 className={display ? "text-display text-balance" : "text-title-1 text-balance"}>{title}</h1>
      {children && <div className="auth-lead mt-2 text-pretty">{children}</div>}
    </div>
  )
}

/** A skeleton bar with the 1.2s shimmer. */
function Skel({ className }: { className?: string }) {
  return <div className={cn("auth-skel", className)} />
}

/**
 * A page's place while it checks something before it can draw (a session, an
 * invitation, whether the server needs an admin): its heading and form in the
 * anatomy that follows, announced as `label`. Nothing in it reads as an
 * action. `providers` draws the sign-in's own shape: the 2-up providers and
 * the passkey over the divider.
 */
export function AuthPlaceholder({
  label,
  fields = 0,
  buttons = 1,
  providers = false,
}: {
  label: string
  fields?: number
  buttons?: number
  providers?: boolean
}) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      <div aria-hidden="true">
        <div className="mb-8 space-y-3">
          <Skel className="h-9 w-56" />
          <Skel className="h-4 w-40" />
        </div>
        <div className="space-y-4">
          {providers && (
            <>
              <div className="auth-providers">
                <Skel className="h-11 md:h-10" />
                <Skel className="h-11 md:h-10" />
                <Skel className="auth-wide h-11 md:h-10" />
              </div>
              <Skel className="mx-auto h-3 w-8" />
            </>
          )}
          {Array.from({ length: fields }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skel className="h-4 w-24" />
              <Skel className="h-11 md:h-10" />
            </div>
          ))}
          {Array.from({ length: buttons }, (_, i) => (
            <Skel key={i} className="h-11 md:h-10" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** A hairline with a word in it, in sentence case: "or". */
export function AuthDivider({ children = "or" }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-2xs text-faint-foreground" role="separator" aria-label={typeof children === "string" ? children : undefined}>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span aria-hidden="true">{children}</span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  )
}

/** The height every full-width control on these pages shares: 44px on a phone, 40px from md. */
export const authControl = "h-11 w-full md:h-10"

/**
 * The first run's and joining's primary, xl: 46px, r10, full width. Built on
 * size lg rather than size xl because Button's xl carries text-body, which
 * tailwind-merge reads as a colour and so drops the variant's text colour
 * (the label went dark on the accent).
 */
export const authControlXl = "h-[46px] w-full rounded-[10px] px-5"

/**
 * A link or text button that stands on its own line ("Back to sign in",
 * "Manage notification settings"): a 44px touch target on a phone, plain text
 * height from md. A link inside a sentence keeps its line's height.
 */
export const authLink = "inline-flex min-h-11 items-center gap-1.5 md:min-h-0"

type FieldProps = Omit<React.ComponentProps<"input">, "id"> & {
  id: string
  label: React.ReactNode
  /** Help under the field. Replaced by the error while there is one. */
  hint?: React.ReactNode
  /** This field's own problem, said under it and tied to it for a screen reader. */
  error?: string
  /** Something level with the label on the right, such as "Forgot password?". */
  aside?: React.ReactNode
  /** Inside the input's right edge (a show button, a match check). */
  end?: React.ReactNode
  /** Changes on each failed attempt, to shake the field again. */
  shakeKey?: number
  /** Under the field, after the hint (a strength meter, the caps-lock line). */
  below?: React.ReactNode
}

/**
 * A label above (13/510, ink), the field (40px, 44 on a phone; raised at e1,
 * r8; the halo on focus, the danger halo when invalid), then its help or its
 * error with a glyph.
 */
export const AuthField = React.forwardRef<HTMLInputElement, FieldProps>(function AuthField(
  { id, label, hint, error, aside, end, shakeKey, below, className, ...input },
  ref,
) {
  const noteId = `${id}-note`
  const note = error || hint
  // A refused value shakes the field (x ±4px twice, 280ms), again on each
  // refusal, restarted in place: remounting it would take the cursor away.
  const boxRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const box = boxRef.current
    if (!box || !shakeKey) return
    box.classList.remove("auth-shake")
    void box.offsetWidth
    box.classList.add("auth-shake")
  }, [shakeKey])
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="auth-label">
          {label}
        </label>
        {aside}
      </div>
      <div ref={boxRef} className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className={cn("field-surface auth-input", className)}
          data-pad-end={end ? "" : undefined}
          {...input}
        />
        {end}
      </div>
      {error ? (
        <p id={noteId} role="alert" className="auth-field-error">
          <AlertCircle aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={noteId} className="auth-hint">
          {hint}
        </p>
      ) : null}
      {below}
    </div>
  )
})

/** Whether Caps Lock is on, read from one field's key events. */
function useCapsLock() {
  const [on, setOn] = useState(false)
  const read = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") setOn(e.getModifierState("CapsLock"))
  }
  return { on, read, off: () => setOn(false) }
}

/** A password field: the show button inside it (the eye crossfades), and a caps-lock line while Caps Lock is on. */
export const PasswordField = React.forwardRef<
  HTMLInputElement,
  FieldProps & { visible?: boolean; onVisibleChange?: (v: boolean) => void }
>(function PasswordField({ visible: controlled, onVisibleChange, below, onKeyDown, onKeyUp, onBlur, ...props }, ref) {
  const [own, setOwn] = useState(false)
  const visible = controlled ?? own
  const toggle = () => (onVisibleChange ? onVisibleChange(!visible) : setOwn(!visible))
  const caps = useCapsLock()
  return (
    <AuthField
      ref={ref}
      type={visible ? "text" : "password"}
      onKeyDown={(e) => {
        caps.read(e)
        onKeyDown?.(e)
      }}
      onKeyUp={(e) => {
        caps.read(e)
        onKeyUp?.(e)
      }}
      onBlur={(e) => {
        caps.off()
        onBlur?.(e)
      }}
      end={
        <button type="button" onClick={toggle} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} className="auth-eye">
          <Eye className="auth-eye-show" aria-hidden="true" />
          <EyeOff className="auth-eye-hide" aria-hidden="true" />
        </button>
      }
      below={
        <>
          {caps.on && (
            <p className="auth-caps" role="status">
              <ArrowBigUp className="h-3.5 w-3.5" aria-hidden="true" />
              Caps Lock is on
            </p>
          )}
          {below}
        </>
      }
      {...props}
    />
  )
})

export type NoticeTone = "error" | "warning" | "neutral"

const NOTICE_ICON: Record<NoticeTone, typeof AlertCircle> = { error: AlertCircle, warning: AlertTriangle, neutral: Info }

/**
 * The notice card (F2): r12 on the sunken surface inside a hairline, a 32px
 * tile (sun for a limit, danger for a block, neutral for nobody's fault), the
 * title at 14/510 and one sentence. Not red text.
 */
export function AuthNotice({
  tone,
  title,
  children,
  id,
  role,
}: {
  tone: NoticeTone
  title?: React.ReactNode
  children?: React.ReactNode
  id?: string
  role?: "alert" | "status" | "note"
}) {
  const Icon = NOTICE_ICON[tone]
  return (
    <div id={id} role={role ?? (tone === "error" ? "alert" : "status")} data-tone={tone} className="auth-notice">
      <span className="auth-notice-tile">
        <Icon aria-hidden="true" />
      </span>
      <div className="min-w-0 space-y-0.5 pt-1.5">
        {title && <h2 className="text-sm font-medium">{title}</h2>}
        {children && <p className="text-xs text-muted-foreground">{children}</p>}
      </div>
    </div>
  )
}

/** A problem with the whole form rather than one field: the notice card, in danger. */
export function FormProblem({ children, id }: { children: React.ReactNode; id?: string }) {
  if (!children) return null
  return (
    <AuthNotice tone="error" id={id}>
      {children}
    </AuthNotice>
  )
}

/** Up to two initials from an address's name part: "priya.r@x" is "PR". */
export function initialsOf(text: string): string {
  const name = text.split("@")[0] ?? ""
  const parts = name.split(/[._\-+\s]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 1)
  return (letters || "?").toUpperCase()
}

/** A person's gradient avatar from an address or a name, initials in white. */
export function AuthAvatar({ seed, size = 24, initials }: { seed: string; size?: number; initials?: string }) {
  const shown = (initials ?? initialsOf(seed)).slice(0, size >= 28 ? 2 : 1)
  return (
    <span
      className={cn("auth-avatar", avatarHueClass(hueFor(seed)))}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.375) }}
      aria-hidden="true"
    >
      {size >= 20 ? shown : null}
    </span>
  )
}

/**
 * Who this is, as a 32px chip: the gradient avatar, the address and, when it
 * can be changed, "Change". The two-step sign-in's email after the first step,
 * and the fixed address on an invitation.
 */
export function IdentityChip({ email, onChange }: { email: string; onChange?: () => void }) {
  return (
    <div className="auth-chipid" data-identity-chip="">
      <AuthAvatar seed={email} size={24} />
      <span className="auth-chipid-address" translate="no">
        {email}
      </span>
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          aria-label={`Change the email, ${email}`}
          className="inline-flex h-11 items-center rounded-md px-2 text-xs font-medium text-brand-text hover:underline md:h-6"
        >
          Change
        </button>
      )}
    </div>
  )
}

/** "Step 1 of 3 · Your account": three 4px dots, the current one brand. */
export function StepPill({ step, of = 3, label }: { step: number; of?: number; label: string }) {
  return (
    <span className="auth-steppill" data-step-pill="">
      <span className="inline-flex gap-1" aria-hidden="true">
        {Array.from({ length: of }, (_, i) => (
          <i key={i} data-on={i + 1 === step ? "" : undefined} />
        ))}
      </span>
      Step {step} of {of} · {label}
    </span>
  )
}

/**
 * A rough strength for a new password, 0 (nothing typed) to 4: length first,
 * then the mix of kinds of character. The word shows, not a score.
 */
export function passwordStrength(password: string): { level: 0 | 1 | 2 | 3 | 4; word: string } {
  if (!password) return { level: 0, word: "" }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  let level: 1 | 2 | 3 | 4 = 1
  if (password.length >= 8) level = 2
  if (password.length >= 12 && kinds >= 2) level = 3
  if (password.length >= 14 && kinds >= 3) level = 4
  if (password.length >= 20 && level < 3) level = 3
  return { level, word: level === 1 ? "Weak" : level === 2 ? "Fine" : "Strong" }
}

/** Four 3px segments of 44px (danger, sun, moss, moss) and the word on the right. */
export function StrengthMeter({ password }: { password: string }) {
  const { level, word } = passwordStrength(password)
  return (
    <div className="auth-strength" data-level={level} data-strength-meter="">
      {[1, 2, 3, 4].map((n) => (
        <i key={n} data-on={n <= level ? "" : undefined} aria-hidden="true" />
      ))}
      {word && <span className="auth-strength-word">{word}</span>}
    </div>
  )
}

/** The 14px moss check inside a repeated password's right edge, once the two match. */
export function MatchCheck() {
  return (
    <span className="auth-match" data-match-check="" role="img" aria-label="They match">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  )
}
