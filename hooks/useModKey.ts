"use client"

import { useEffect, useState } from "react"

/** ⌘ on a Mac, Ctrl elsewhere; read once after mount, so the server never guesses. */
export function useModKey(): string {
  const [mod, setMod] = useState("Ctrl")
  useEffect(() => {
    const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || ""
    if (/mac|iphone|ipad/i.test(p)) setMod("⌘")
  }, [])
  return mod
}
