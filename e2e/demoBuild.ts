import { readFileSync } from "node:fs"

// Which build this is: NEXT_PUBLIC_DEMO_MODE as the suite's environment sets
// it, else as the repository's .env.production does, which next build reads.
// A customer's repository has no such line, so this reads false there. The
// demo's suite runs the demo build and a customer's runs theirs, so a spec
// that checks what only the demo shows asks this first.
export function demoBuild(): boolean {
  const set = process.env.NEXT_PUBLIC_DEMO_MODE
  if (set !== undefined) return set === "true"
  try {
    return /^NEXT_PUBLIC_DEMO_MODE=true\s*$/m.test(readFileSync(".env.production", "utf8"))
  } catch {
    return false
  }
}
