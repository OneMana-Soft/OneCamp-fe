import { MilestoneMark } from "@/components/work/milestones/MilestoneMark"
import { targetWords, type Milestone } from "@/lib/work/milestones"

/**
 * A project's milestones on the projects overview's timeline (linear-16): a
 * diamond on each target day (left, in the row's grid), named with its day in
 * its title. A chunk of its own, so the overview's first load doesn't carry it.
 */
export function MilestoneMarks({ marks, today }: { marks: { m: Milestone; left: number }[]; today: Date }) {
  return (
    <>
      {marks.map(({ m, left }) => {
        const target = targetWords(m, today)
        return (
          <span
            key={m.id}
            data-milestone-target={m.id}
            title={`${m.name}${target ? `, ${target.text}${target.late ? ", late" : ""}` : ""}`}
            className="absolute top-1/2 z-[2] flex -translate-x-1/2 -translate-y-1/2"
            style={{ left }}
          >
            <MilestoneMark progress={m.progress} next={m.next} />
          </span>
        )
      })}
    </>
  )
}
