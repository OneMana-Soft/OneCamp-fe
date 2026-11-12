/**
 * What a found thing is, on the right of its row in muted ink: "Task",
 * "Project", "Doc", "Board". The word is the kind itself (lib/search/hitRef),
 * its first letter in capitals, so there is no second list of kinds to words.
 * The space before it keeps it a word of its own where a row is named by what
 * it says (the entity-link search's "Book the venue task"), so a screen reader
 * tells a task from a doc of the same name. The table's relation picker and
 * the entity-link search write it.
 */
export function HitKindWord({ kind }: { kind: string }) {
  return (
    <>
      {" "}
      <span className="text-meta text-ink-3 first-letter:uppercase">{kind}</span>
    </>
  )
}
