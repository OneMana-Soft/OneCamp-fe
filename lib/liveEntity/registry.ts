import type { EntityKind } from "./types"

/**
 * The kinds of thing a chip can stand for (types.ts). A kind is registered
 * once, from the code that owns it; a second registration of one name is a
 * mistake two packages made, and throws.
 */

const kinds = new Map<string, EntityKind<never>>()

export function registerEntityKind<D>(spec: EntityKind<D>): void {
  if (kinds.has(spec.kind)) throw new Error(`The chip kind "${spec.kind}" is registered twice`)
  kinds.set(spec.kind, spec as unknown as EntityKind<never>)
}

/** The kind registered under a name, if one is. */
export function entityKind<D = unknown>(kind: string): EntityKind<D> | undefined {
  return kinds.get(kind) as EntityKind<D> | undefined
}
