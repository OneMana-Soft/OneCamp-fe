/**
 * A busy state that several actions share names the one under way: a union
 * ("restore" | "purge"), a row's id, a create's key. A control is busy only
 * with its own action, and waits, disabled, while another runs.
 */
export function busyWith<K>(running: K | null | undefined, own: NoInfer<K>) {
  return { busy: running === own, disabled: running != null && running !== own }
}
