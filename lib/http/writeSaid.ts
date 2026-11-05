// Failed writes their caller said (V-397).
const said = new WeakSet<object>()

export function saysWriteFailure(error: unknown): void {
  if (error && typeof error === "object") said.add(error)
}

export const wasSaid = (error: unknown) => !!error && typeof error === "object" && said.has(error)
