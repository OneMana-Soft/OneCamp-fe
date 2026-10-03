"use client"

import { useEffect } from "react"
import { useSWRConfig } from "swr"
import { bindAppMutate } from "@/lib/swrMutate"

/** Hands the provider-bound mutate to code outside components (see lib/swrMutate). */
export function SWRMutateBridge() {
  const { mutate } = useSWRConfig()
  // Bound during render too, so effects in children that run first already see it.
  bindAppMutate(mutate)
  useEffect(() => () => bindAppMutate(null), [])
  return null
}
