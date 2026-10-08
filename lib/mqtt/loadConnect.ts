import type { connect as Connect } from "mqtt"

/**
 * The mqtt library's connect, loaded when the first connection is made (it's
 * about 400 KB, kept off the first screen).
 *
 * Which shape `import("mqtt")` gives depends on the bundler: Node and Vitest
 * resolve the ESM build, whose named export is `connect`, but the production
 * browser bundle resolves the UMD build, where `connect` sits on `default`. A
 * bare `const { connect } = await import("mqtt")` was undefined in production
 * and no live connection opened ("a is not a function"), while every test
 * passed. Both shapes are read here.
 */
export function connectOf(lib: unknown): typeof Connect {
  const mod = lib as { connect?: typeof Connect; default?: { connect?: typeof Connect } }
  const connect = mod.connect ?? mod.default?.connect
  if (typeof connect !== "function") throw new Error("the mqtt library has no connect")
  return connect
}

export async function loadConnect(): Promise<typeof Connect> {
  return connectOf(await import("mqtt"))
}
