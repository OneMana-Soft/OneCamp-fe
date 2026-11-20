import { personHue } from "@/lib/utils/getAvatarColor"
import { avatarHueClass } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"

/** A board comment's author: their hue and one letter (a pin's 22 px face, a message's 24 px). */
export function CommentFace({ name, className }: { name: string; className: string }) {
  return (
    <span className={cn(avatarHueClass(personHue(name)), "avatar-person inline-flex items-center justify-center text-micro", className)}>
      {(name || "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  )
}
