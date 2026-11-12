"use client"

import { useEffect, useRef, type ComponentProps } from "react"

import type { ConnectionPill } from "@/components/docEditor/ConnectionPill"
import { needsNoCode, PillFrame, ProblemWords, useShownProblem } from "@/components/docEditor/ConnectionPillFrame"
import { useLatch } from "@/hooks/useLatch"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { whenIdle } from "@/lib/whenIdle"

type Props = ComponentProps<typeof ConnectionPill>

/** Until the pill's code is in (offline, or a deploy renamed it), it says offline or unavailable all the same (V-667); one for coming and failed, so its wait runs on. */
function StandIn({ problem, said, docked = false, className, ...rest }: Props) {
  const shown = useShownProblem(problem, said)
  return needsNoCode(shown) ? (
    <PillFrame shown={shown} docked={docked} className={className}>
      <ProblemWords shown={shown} docked={docked} {...rest} />
    </PillFrame>
  ) : null
}

const pill = lazyPart<Props>(() => import("@/components/docEditor/ConnectionPill").then((m) => m.ConnectionPill), { placeholder: StandIn, failed: StandIn })

/**
 * The live doc's connection notice, as a chunk of its own: it shows only on a
 * problem, so opening a doc doesn't carry it. Its code comes once the page is
 * idle, to be in before it is needed (offline, once back). It is drawn from
 * the first problem on, so that "Back online" can follow.
 */
export function LazyConnectionPill(props: Props) {
  const asked = useLatch(!!props.problem)
  const said = useRef(false)
  useEffect(() => whenIdle(() => void pill.warm()), [])
  return asked ? <pill.Part {...props} said={said} /> : null
}
