/**
 * A task field message, live or a Work Change Log diff: its value is written
 * (null takes it off). refetch: true tells none (a money field's, V-698): it
 * writes nothing and the task is read again, as the server lets this member.
 */
export function applyFieldMessage<V>(m: { value?: V | null; refetch?: unknown }, to: { write(value: V | null): void; reread(): void }) {
  if (m.refetch === true) to.reread()
  else to.write(m.value ?? null)
}
