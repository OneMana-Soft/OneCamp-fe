import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { cn } from "@/lib/utils/helpers/cn"
import { ownerName, type GoalOwner as Owner } from "@/lib/goals"

/** Who owns a goal: their picture (or initials) and, unless compact, their name. */
export function GoalOwner({ owner, compact = false, className }: { owner: Owner; compact?: boolean; className?: string }) {
  const { src } = useUserAvatar(owner.user_profile_object_key)
  const name = ownerName(owner)
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)} title={compact ? name : undefined}>
      <Avatar className="h-5 w-5 shrink-0 border border-border/50">
        <AvatarImage src={src} alt="" />
        <AvatarFallback className="text-3xs font-semibold">{getNameInitials(name)}</AvatarFallback>
      </Avatar>
      {!compact && <span className="truncate text-xs text-muted-foreground">{name}</span>}
    </span>
  )
}
