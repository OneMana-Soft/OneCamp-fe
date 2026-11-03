import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { PrincipalTag, botTagKind } from "@/components/ui/principalTag"
import { displayNameOf } from "@/lib/personName"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * An AI teammate (or another bot) as the shared principal pieces draw one: the
 * agent's square (as task rows do), the name, and the kind's tag ("Agent" only
 * when an AI is behind it). New task's Assignee chip draws a template's preset
 * this way. The template manager lists its AI teammates by name instead: from
 * its lazy chunk, this module re-cut the /app shell (bisect-s, 3 Nov).
 */
export function AgentWho({ who }: { who: UserProfileDataInterface }) {
  return (
    <>
      <span aria-hidden className="inline-flex size-[18px] shrink-0">
        <AgentAvatar />
      </span>
      <span className="min-w-0 truncate">{displayNameOf(who)}</span>
      <PrincipalTag kind={botTagKind(who.user_bot_kind)} />
    </>
  )
}
