// Code that takes its time (V-138's own tests): a module that awaits this at its top loads that much later, as a cold
// import does on a busy machine. The clock is the one this module found, so a test that fakes timers later can't stop it.
const realSetTimeout = globalThis.setTimeout

/** Settles after `ms`. */
export const takes = (ms: number) => new Promise<void>((resolve) => void realSetTimeout(resolve, ms))
