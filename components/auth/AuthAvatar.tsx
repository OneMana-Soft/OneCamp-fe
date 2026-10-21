import { personHue } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { avatarHueClass } from "@/components/ui/graphics"

// A person's gradient avatar, apart from the sign-in screens (AuthShell): a
// channel's welcome card draws its people with it, and brought every sign-in
// screen's pieces and art (CampArt) to every channel with it.

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
      className={cn("auth-avatar", avatarHueClass(personHue(seed.includes("@") ? { user_email_id: seed } : seed)))}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.375) }}
      aria-hidden="true"
    >
      {size >= 20 ? shown : null}
    </span>
  )
}
