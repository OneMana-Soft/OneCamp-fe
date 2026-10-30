"use client"

// The password row of Sign-in and security (design v3, admin D1): what you
// have, and "Change…", which opens a dialog with the three fields and a
// strength meter (four segments, danger to sun to moss, and a word).

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SettingsCardError, SettingsRowsSkeleton } from "@/components/ui/settingsSection"
import { Check } from "@/lib/icons"
import { AuthField, PasswordField } from "@/components/auth/AuthShell"
import AuthService from "@/services/auth/AuthService"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { passwordStrength } from "@/components/profile/passwordStrength"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Whether this account has a password. Throws when the server couldn't be
 * asked, which is not the same answer as "no": the sign-in service's own
 * check returns false for both, and this row then told someone with a
 * password "No password yet" and offered to set one.
 */
async function checkHasPassword(): Promise<boolean> {
  const res = await axiosInstance.get("/auth/has-password", OWN_ERRORS)
  return res.data?.has_password === true
}

const SEGMENT = ["", "bg-destructive", "bg-warning", "bg-success", "bg-success"] as const

/** The 4-segment meter and its word, under the new password. */
export function StrengthMeter({ password }: { password: string }) {
  const { score, word } = passwordStrength(password)
  if (!password) return null
  return (
    <div data-strength={score} className="flex items-center gap-3" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 rounded-sm", i <= score ? SEGMENT[score] : "bg-press")} />
        ))}
      </div>
      <span className="w-16 text-right text-2xs font-medium text-muted-foreground">
        <span className="sr-only">Password strength: </span>
        {word}
      </span>
    </div>
  )
}

function PasswordDialog({
  open,
  onOpenChange,
  hasPassword,
  onChanged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  hasPassword: boolean
  onChanged: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) return
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setError("")
    setShowCurrent(false)
    setShowNew(false)
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (hasPassword && !currentPassword) return setError("Enter your current password first.")
    if (newPassword.length < 8) return setError("Use at least 8 characters for the new password.")
    if (newPassword.length > 72) return setError("Use 72 characters or fewer for the new password.")
    if (newPassword !== confirmPassword) return setError("The two new passwords are different. Type the same one in both.")
    setSubmitting(true)
    try {
      const result = await AuthService.changePassword(currentPassword, newPassword)
      if (result.ok) {
        onChanged()
        onOpenChange(false)
      } else {
        setError(result.msg || "Couldn't change your password. Try again.")
      }
    } catch {
      setError("Couldn't change your password. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{hasPassword ? "Change your password" : "Set a password"}</DialogTitle>
          <DialogDescription>
            {hasPassword ? "Your current password stops working once the new one is saved." : "Then you can sign in by email as well."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {hasPassword && (
            <PasswordField
              id="current-password"
              name="current-password"
              label="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              visible={showCurrent}
              onVisibleChange={setShowCurrent}
            />
          )}
          <div className="space-y-2">
            <PasswordField
              id="new-password"
              name="new-password"
              label="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              hint="At least 8 characters."
              required
              minLength={8}
              visible={showNew}
              onVisibleChange={setShowNew}
            />
            <StrengthMeter password={newPassword} />
          </div>
          <AuthField
            id="confirm-new-password"
            name="confirm-new-password"
            label="Type the new one again"
            type={showNew ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          {error && (
            <p role="alert" className="text-xs text-danger-ink text-pretty">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" busy={submitting}>
              {submitting ? "Saving…" : hasPassword ? "Change password" : "Set password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ChangePasswordSection() {
  // null while it is checked, "failed" when it couldn't be.
  const [hasPassword, setHasPassword] = useState<boolean | null | "failed">(null)
  const [open, setOpen] = useState(false)
  const [changed, setChanged] = useState(false)

  const load = useCallback(() => {
    setHasPassword(null)
    checkHasPassword()
      .then(setHasPassword)
      .catch(() => setHasPassword("failed"))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // The row keeps its place while it is checked, so the rows under it do
  // not jump when the answer comes.
  if (hasPassword === null) {
    return (
      <div role="status" aria-label="Checking your password" className="contents">
        <SettingsRowsSkeleton rows={1} control="button" />
      </div>
    )
  }

  if (hasPassword === "failed") return <SettingsCardError title="Couldn't check your password" onRetry={load} />

  return (
    <div data-setting-row="" className="set-row flex items-center justify-between gap-6">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-medium leading-5">
          {hasPassword ? "Password" : "No password yet"}
          {changed && (
            <span data-saved-tick="" className="saved-tick inline-flex items-center gap-1 text-2xs font-medium">
              <Check className="size-3.5" aria-hidden="true" />
              Changed
            </span>
          )}
        </h3>
        <p className="text-xs text-muted-foreground text-pretty">
          {hasPassword ? "The password you sign in with by email." : "You sign in another way. Add a password to sign in by email too."}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        aria-label={hasPassword ? "Change password" : "Set a password"}
        onClick={() => setOpen(true)}
      >
        {hasPassword ? "Change…" : "Set a password…"}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {changed ? "Password changed" : ""}
      </span>
      <PasswordDialog
        open={open}
        onOpenChange={setOpen}
        hasPassword={hasPassword}
        onChanged={() => {
          setHasPassword(true)
          setChanged(true)
          window.setTimeout(() => setChanged(false), 2400)
        }}
      />
    </div>
  )
}
