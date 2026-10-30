"use client"

import { useEffect, useState, type ComponentProps } from "react"

import type { ConnectionPill } from "@/components/docEditor/ConnectionPill"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { whenIdle } from "@/lib/whenIdle"

type Props = ComponentProps<typeof ConnectionPill>

const Nothing = () => null
const pill = lazyPart<Props>(() => import("@/components/docEditor/ConnectionPill").then((m) => m.ConnectionPill), { placeholder: Nothing, failed: Nothing })

/**
 * The live doc's connection notice, as a chunk of its own: it shows only on a
 * problem, so opening a doc doesn't carry it. Its code comes once the page is
 * idle, to be in before it is needed (offline it couldn't come, and the app's
 * own notice says offline meanwhile). It is drawn from the first problem on,
 * so that "Back online" can follow.
 */
export function LazyConnectionPill(props: Props) {
  const [asked, setAsked] = useState(false)
  if (props.problem && !asked) setAsked(true)
  useEffect(() => whenIdle(() => void pill.warm()), [])
  return asked ? <pill.Part {...props} /> : null
}
