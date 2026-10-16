import { DocPageSkeleton } from "@/components/doc/DocPageSkeleton"

/**
 * While a doc opens, the doc's own skeleton (its header and reading column),
 * not the docs list's ten rows (how-docs-work N36): app/app/doc/loading.tsx
 * was the nearest boundary.
 */
export default function Loading() {
  return <DocPageSkeleton />
}
