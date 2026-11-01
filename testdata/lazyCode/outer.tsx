import { Suspense } from "react"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { takes } from "./takes"

await takes(800)

const Inner = lazyPiece(() => import("./inner"))

export default function Outer() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
