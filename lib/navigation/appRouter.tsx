"use client"

// The router's moves without the address; a move writes what waits first (appRouter.test.tsx says why).
import { createContext, useContext, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

export type AppRouter = Pick<ReturnType<typeof useRouter>, "push" | "replace" | "prefetch" | "back" | "forward" | "refresh">

const Moves = createContext<AppRouter | null>(null)

export const waiting = new Set<() => void>()
const first = () => waiting.forEach((now) => now())

/** Takers of a move in place (lib/navigation/inPlace): one that takes the move makes it with no move. */
export const inPlace = new Set<(href: string) => boolean>()
const taken = (href: string) => [...inPlace].some((take) => take(href))

export function AppRouterProvider({ children }: { children: ReactNode }) {
  const next = useRouter()
  const [moves] = useState<AppRouter>(() => ({
    ...next,
    push: (...a) => void (taken(a[0]) || (first(), next.push(...a))),
    replace: (...a) => void (taken(a[0]) || (first(), next.replace(...a))),
  }))
  return <Moves.Provider value={moves}>{children}</Moves.Provider>
}

export function useAppRouter(): AppRouter {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- in the provider for its whole life or never
  return useContext(Moves) ?? useRouter()
}
