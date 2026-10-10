"use client"

// The frame every signed-out screen shares: sign in, accept an invitation,
// forgot and reset a password, and the first admin's setup.
//
// Each of those pages used to draw its own: a 48px logo centred over a
// centred heading over centred help text, the theme toggle floating in a
// corner, and a lock or envelope inside every field. Five copies of the same
// template drifted (one heading was tight-tracked so "Join the" ran together,
// one form had labels and the next only placeholders). Now there is one: the
// product's name where a page's name goes, one column, the heading and its
// line left-aligned over the form they introduce, and a label above each
// field.

import * as React from "react"
import { useState } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Eye, EyeOff } from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeToggle } from "@/components/themeProvider/theme-toggle"

export function AuthShell({
  children,
  className,
  side,
}: {
  children: React.ReactNode
  className?: string
  /**
   * A picture beside the form from lg up (the ring motif beside the sign-in).
   * Decorative, so hidden from screen readers, and not drawn on a phone. Without
   * it the page is the one column it always was.
   */
  side?: React.ReactNode
}) {
  // Not centred on the viewport: a column that starts a fixed step below the
  // header keeps the heading in one place while the form under it grows (an
  // error, the code step) instead of the whole page jumping.
  const main = (
    <main id="main-content" className="flex flex-1 justify-center px-4 pb-16 pt-[clamp(1.5rem,10vh,6rem)]">
      <div className={cn("w-full max-w-[22.5rem]", className)}>{children}</div>
    </main>
  )
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 sm:px-8 sm:py-5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold" translate="no">
          {/* Decorative beside the name it spells. */}
          <img src="/logo.svg" alt="" width={24} height={24} className="h-6 w-6" />
          OneCamp
        </span>
        <ThemeToggle />
      </header>
      {side ? (
        <div className="flex flex-1 lg:grid lg:grid-cols-2">
          {main}
          <div data-auth-side="" aria-hidden="true" className="hidden min-w-0 lg:flex">
            {side}
          </div>
        </div>
      ) : (
        main
      )}
    </div>
  )
}

/**
 * The page's heading and, when it says something the heading doesn't, one line
 * under it. `art` is a picture above the heading (a 404's, a dead link's):
 * decorative, so hidden from screen readers.
 */
export function AuthHeading({ title, children, art }: { title: React.ReactNode; children?: React.ReactNode; art?: React.ReactNode }) {
  return (
    <div className="mb-8 space-y-2">
      {art && (
        <div data-auth-art="" aria-hidden="true" className="mb-6">
          {art}
        </div>
      )}
      {/* The display face is set tight already; tracking-tight on top ran
          "Join the" into one word. */}
      <h1 className="font-display text-2xl font-semibold text-balance">{title}</h1>
      {children && <div className="text-sm text-muted-foreground text-pretty">{children}</div>}
    </div>
  )
}

/**
 * A page's place while it checks something before it can draw (a session, an
 * invitation, whether the server needs an admin): its heading and form in
 * outline, the same size as what follows, announced as `label`. Nothing in it
 * reads as an action. It was a spinner beside a line of text, or nothing.
 */
export function AuthPlaceholder({ label, fields = 0, buttons = 1 }: { label: string; fields?: number; buttons?: number }) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      <div aria-hidden="true">
        {/* AuthHeading's shape: a 32px title over a line, 32px above the form. */}
        <div className="mb-8 space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full max-w-64" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: fields }, (_, i) => (
            // AuthField's shape: a 20px label line over the field.
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-11 w-full md:h-10" />
            </div>
          ))}
          <div className="space-y-2">
            {Array.from({ length: buttons }, (_, i) => (
              <Skeleton key={i} className={authControl} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A hairline with a word in it, in sentence case: "or". */
export function AuthDivider({ children = "or" }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator" aria-label={typeof children === "string" ? children : undefined}>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span aria-hidden="true">{children}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}

/** The height every full-width control on these pages shares: 44px on a phone, 40px from md. */
export const authControl = "h-11 w-full md:h-10"

/**
 * A link or text button that stands on its own line ("Back to sign in",
 * "Manage notification settings"): a 44px touch target on a phone, plain text
 * height from md. They were 17 to 20px tall on a phone. A link inside a
 * sentence keeps its line's height.
 */
export const authLink = "inline-flex min-h-11 items-center gap-1.5 md:min-h-0"

type FieldProps = Omit<React.ComponentProps<typeof Input>, "id"> & {
  id: string
  label: React.ReactNode
  /** Help under the field. Replaced by the error while there is one. */
  hint?: React.ReactNode
  /** This field's own problem, said under it and tied to it for a screen reader. */
  error?: string
  /** Something level with the label on the right, such as "Forgot password?". */
  aside?: React.ReactNode
}

/** A label above, the field, then its help or its error. */
export const AuthField = React.forwardRef<HTMLInputElement, FieldProps>(function AuthField(
  { id, label, hint, error, aside, className, ...input },
  ref,
) {
  const noteId = `${id}-note`
  const note = error || hint
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        {/* Quiet, as the task panel's labels are: the eye goes to what is
            typed, not to the words about it. */}
        <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
          {label}
        </label>
        {aside}
      </div>
      <Input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cn("md:h-10", error && "border-destructive/60", className)}
        {...input}
      />
      {note && (
        <p id={noteId} role={error ? "alert" : undefined} className={cn("text-xs", error ? "text-danger-ink" : "text-muted-foreground")}>
          {note}
        </p>
      )}
    </div>
  )
})

/** A password field with its show button inside it. */
export const PasswordField = React.forwardRef<HTMLInputElement, FieldProps & { visible?: boolean; onVisibleChange?: (v: boolean) => void }>(
  function PasswordField({ visible: controlled, onVisibleChange, className, ...props }, ref) {
    const [own, setOwn] = useState(false)
    const visible = controlled ?? own
    const toggle = () => (onVisibleChange ? onVisibleChange(!visible) : setOwn(!visible))
    return (
      <div className="relative">
        <AuthField ref={ref} type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
        {/* Placed against the input, whose top sits under the label row (20px + the 8px gap). */}
        <button
          type="button"
          onClick={toggle}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-0 top-7 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 md:h-10 md:w-10"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    )
  },
)

/** A problem with the whole form rather than one field, under the fields it follows. */
export function FormProblem({ children, id }: { children: React.ReactNode; id?: string }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="text-sm text-danger-ink">
      {children}
    </p>
  )
}
