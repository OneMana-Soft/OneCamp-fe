/**
 * Deprecated re-export — the canonical implementation lives in
 * `@/lib/utils/getNameInitials`. This shim exists so existing imports
 * keep working while the rest of the codebase migrates.
 *
 * New code should import from `@/lib/utils/getNameInitials` instead.
 */

export { getNameInitials } from "@/lib/utils/getNameInitials"
