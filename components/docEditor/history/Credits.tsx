"use client"

/**
 * Who a version credits: their faces (a person round, in their hue; an agent
 * square, in the agent gradient: never a person's shape) and their names, an
 * agent's with the person who asked it ("Release Captain for Sam Rivera").
 */

import { cn } from "@/lib/utils/helpers/cn"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AgentAvatar } from "@/components/ui/graphics"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { creditLine, type Credit } from "./versions"

function Face({ face }: { face: Credit["face"] }) {
  const { src } = useUserAvatar(face.profileKey)
  // Each avatar keeps its own shape (round, or the agent's square); the ring follows it.
  return face.agent ? (
    <span className="inline-flex size-4 shrink-0" data-agent="">
      <AgentAvatar src={src || undefined} className="ring-2 ring-pop" />
    </span>
  ) : (
    <IdentityMark variant="avatar" size={16} id={avatarSeed(face.name)} label={face.name} src={src || undefined} className="ring-2 ring-pop" />
  )
}

export function Credits({ credits, className, max = 3 }: { credits: Credit[]; className?: string; max?: number }) {
  const line = creditLine(credits)
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)} data-version-credits="">
      <span aria-hidden="true" className="flex shrink-0 -space-x-1">
        {credits.slice(0, max).map((c) => (
          <Face key={c.key} face={c.face} />
        ))}
      </span>
      <span className="min-w-0 truncate text-meta text-ink-2" title={credits.map((c) => c.label).join(", ")}>
        {line}
      </span>
    </div>
  )
}
