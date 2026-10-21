import { isClosedStatus, type ProjectStatuses, type StatusOption } from "@/lib/taskStatus"

/** A project's statuses with its board order (every status's value, as its admins set it). */
export type OrderedStatuses = ProjectStatuses & { order?: string[] }

/**
 * options in the project's board order, as the server's EffectiveOrder places
 * them: those it names, as named; one it doesn't yet after its default
 * predecessor; closed ones last. Out of lib/taskStatus, which every first
 * screen carries. Pure.
 */
export function inOrder(options: StatusOption[], order?: string[]): StatusOption[] {
  if (!order?.length) return options
  const out = options.filter((o) => order.includes(o.value)).sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value))
  options.forEach((o, i) => {
    if (!out.includes(o)) out.splice(i === 0 ? 0 : out.indexOf(options[i - 1]) + 1, 0, o)
  })
  const closed = (o: StatusOption) => isClosedStatus(o.category)
  return [...out.filter((o) => !closed(o)), ...out.filter(closed)]
}
