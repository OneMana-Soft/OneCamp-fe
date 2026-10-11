import { SheetSkeleton } from "@/components/protectedRoute/SkeletonShell"

/** While this page loads, its skeleton inside the sheet; the shell stays put (design v3, shell §L2). */
export default function Loading() {
  return <SheetSkeleton kind="list" rows={12} rowHeight={40} />
}
