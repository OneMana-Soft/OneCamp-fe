"use client"

import { Suspense } from "react"
import { lazyPiece, type LazyPiece } from "@/lib/lazy/lazyPiece"

// A list's forecast lines are one chunk, with the forecast's words (V-49); the page reads the forecasts and hands them
// over (hooks/useProjectForecasts), so the chunk and the read come at once. They add to rows already drawn,
// so each waits in a Suspense of its own that holds no room: a row never waits for them. If their code can't come,
// lazyPiece draws nothing and asks again when the browser is back online, and the rows carry on without them.
// lazyPiece is already on every route that draws a button, so the lines bring no loader of their own.
const lines = () => import("./ForecastLines")

function line<P extends object>(Piece: LazyPiece<P>) {
  return function Line(props: P) {
    return (
      <Suspense fallback={null}>
        <Piece {...props} />
      </Suspense>
    )
  }
}

export const LazyForecastWhenOf = line(lazyPiece(() => lines().then((m) => ({ default: m.ForecastWhenOf }))))
export const LazyGoalProjectLands = line(lazyPiece(() => lines().then((m) => ({ default: m.GoalProjectLands }))))
export const LazyGoalLandsLate = line(lazyPiece(() => lines().then((m) => ({ default: m.GoalLandsLate }))))
