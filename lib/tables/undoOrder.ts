/**
 * The order a table's writes were made in, for Undo (V-360). A write enters
 * when made, before any answer, so an Undo pressed while it's on its way
 * takes THAT write once it lands, never the change before it: by the change
 * set its answer names, whatever order the writes land in.
 */

export type Aim =
  /** The reader's latest change, as the server keeps it: nothing was on its way, or a server from before V-360 answered with no change set. */
  | { kind: "latest" }
  /** The write on its way at the press, saved: its change set. */
  | { kind: "set"; set: string }
  /** The write on its way at the press wasn't saved (lost), or changed nothing (none): nothing to take back. */
  | { kind: "lost" | "none"; what: string }

/** The change set a write's answer names: null when it changed nothing; none (undefined) from a server before V-360. */
export type SetOf<T> = (answer: T) => string | null | undefined

/** Every row write's answer names the change set it stored (V-360, the API's change_set). */
const changeSet = (a: unknown) => (a as { change_set?: string | null } | undefined)?.change_set

const LATEST: Aim = { kind: "latest" }

interface Made {
  /** What an Undo pressed on its way takes, once it's answered. Never rejects: a refusal is lost. */
  aim: Promise<Aim>
  taken: boolean
  onTaken?: () => void
}

export class UndoOrder {
  #going: Made[] = []
  #last: Promise<void> = Promise.resolve()
  #open = 0

  /** Enters a write made now, with its answer on its way: setOf reads the change set it names (by default, change_set). */
  made<T>(what: string, answer: Promise<T>, onTaken?: () => void, setOf: SetOf<T> = changeSet): { taken: () => boolean } {
    const m: Made = {
      aim: answer.then(setOf).then(
        (set): Aim => (set ? { kind: "set", set } : set === null ? { kind: "none", what } : LATEST),
        (): Aim => ({ kind: "lost", what }),
      ),
      taken: false,
      onTaken,
    }
    this.#going.push(m)
    void m.aim.then(() => {
      const i = this.#going.indexOf(m)
      if (i >= 0) this.#going.splice(i, 1)
    })
    return { taken: () => m.taken }
  }

  /** Asked when a write is made, never when it's sent, so no press waits on a write that waits on it. */
  ready(): Promise<void> | null {
    return this.#open > 0 ? this.#last : null
  }

  /** A write made now outside a row's cells (a link, a row added, moved or deleted, a find's replace): after the presses running, entered when made (made's setOf and onTaken). */
  write<T>(what: string, send: () => Promise<T>, setOf?: SetOf<T>, onTaken?: () => void): Promise<T> {
    const free = this.ready()
    const going = free ? free.then(send) : Promise.resolve(send())
    this.made(what, going, onTaken, setOf)
    return going
  }

  /**
   * With `aims` false (a Redo, an Undo of a named change) it takes nothing on
   * its way, and runs once the writes before it have landed.
   */
  press<T>(run: (aim: Aim) => Promise<T>, aims = true): Promise<T> {
    const before = this.#going.map((m) => m.aim)
    const target = aims ? this.#going.pop() : undefined
    if (target) {
      target.taken = true
      target.onTaken?.()
    }
    this.#open++
    const ran = this.#last.then(async () => {
      await Promise.all(before)
      return run(target ? await target.aim : LATEST)
    })
    this.#last = ran.then(
      () => void this.#open--,
      () => void this.#open--,
    )
    return ran
  }
}
