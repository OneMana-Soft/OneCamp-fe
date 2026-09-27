import type { A2ACard } from "@/services/agentService"

/**
 * What an A2A agent says about itself, shown where an admin decides whether to
 * let it answer for their team: who runs it and what it claims it can do. The
 * card is the other side's claim, so it is labelled as that.
 */
export function A2ACardSummary({ card }: { card: A2ACard }) {
  const skills = card.skills ?? []
  return (
    <div className="grid gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-xs">
      <p>
        <span className="font-medium text-foreground">{card.name}</span>
        {card.provider && <span className="text-muted-foreground"> · by {card.provider}</span>}
        {card.version && <span className="text-muted-foreground"> · {card.version}</span>}
      </p>
      {card.description && <p className="text-muted-foreground">{card.description}</p>}
      {skills.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="What it says it can do">
          {skills.slice(0, 8).map((sk) => (
            <li
              key={sk.id || sk.name}
              title={sk.description}
              className="rounded border bg-background px-1.5 py-0.5 text-2xs text-muted-foreground"
            >
              {sk.name}
            </li>
          ))}
          {skills.length > 8 && (
            <li className="px-1 py-0.5 text-2xs text-muted-foreground">+{skills.length - 8} more</li>
          )}
        </ul>
      )}
      <p className="text-muted-foreground">Sends tasks to {card.endpoint}</p>
    </div>
  )
}
