"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { OverlayBody, OverlayFooter, OverlayHeader } from "@/components/ui/overlay"
import { Bell, BellOff, Check, CircleHelp, Clock, Loader2, Minus, WifiOff } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import {
  causeWords,
  deliveryName,
  deliveryStateWords,
  devicesWords,
  stateWords,
  stepWords,
  testDeliveries,
  testTitle,
  failureOf,
  type Delivery,
  type DeliveryState,
  type NotifyState,
  type TestAnswer,
  type Tone,
  type WhyAnswer,
  type WhyTrace,
} from "@/lib/notifications/whyWords"

/**
 * "WHY DID OR DIDN'T I GET THIS?" (A4 H3): the one panel behind both doors,
 * Settings > Notifications' Send me a test and an Inbox row's Why am I seeing
 * this?. It rides the notifications settings' one lazy chunk (main, 9 Nov:
 * components/notifications/KeywordsAndVipsCard's), never a first load. A
 * popover beside its door, which is the door's own element (the Inbox's door
 * is on the row's first load, the panel not); on a phone, a bottom sheet with
 * its actions pinned at its foot (app/overlay.css 8). It only presents: the
 * Inbox's door reads the record with its fetch hook and hands over where that
 * stands, so the panel reaches none of the shared core.
 *
 * Each step's verdict, each delivery's state and each state of the request
 * (loading, offline, refused, too soon, the demo, no record) is said in words
 * of its own (lib/notifications/whyWords). Nothing about anyone else, and no
 * message's body, is in either answer.
 */
/** The door that opened the panel: its element (the panel stands beside it, and focus goes back to it) and the id its aria-controls names. */
export type NotifyDoor = { door: HTMLElement | null; id: string; onClose: () => void }

export type NotifyWhyPanelProps = NotifyDoor &
  ({ kind: "test"; state: NotifyState<TestAnswer>; onAgain: () => void } | { kind: "why"; state: NotifyState<WhyAnswer>; place: string; onAgain: () => void })

const TONE: Record<Tone, string> = { ok: "text-success-ink", held: "text-warning-ink", off: "text-ink-3" }
const MARK = { ok: Check, held: Clock, off: Minus }

function Said({ tone, children, ...rest }: { tone: Tone; children: React.ReactNode } & React.LiHTMLAttributes<HTMLLIElement>) {
  const Mark = MARK[tone]
  return (
    <li className="flex items-start gap-2.5 py-1 text-sm leading-5 text-ink-2" {...rest}>
      <Mark aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", TONE[tone])} />
      <span className="min-w-0 text-pretty">{children}</span>
    </li>
  )
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-meta font-medium text-ink-3">{title}</h3>
      {children}
    </section>
  )
}

function Deliveries({ rows, waiting = [] }: { rows: DeliveryState[]; waiting?: Delivery[] }) {
  if (!rows.length) return null
  return (
    <Part title="Where it went">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map((d, i) => {
          const state = deliveryStateWords(d, waiting.includes(d.delivery))
          return (
            <li key={`${d.delivery}-${i}`} data-delivery={d.delivery} data-state={d.state} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-medium text-foreground">{deliveryName(d.delivery)}</span>
              <span className={cn("text-right text-xs", TONE[state.tone])}>{state.words}</span>
            </li>
          )
        })}
      </ul>
    </Part>
  )
}

function Steps({ trace, place }: { trace: WhyTrace; place: string }) {
  return (
    <Part title="Each step">
      <ol>
        {trace.steps.map((s, i) => {
          const said = stepWords(s, place, s.step === "wait" ? trace.decision?.wait_till : trace.decision?.hold_till)
          return (
            <Said key={`${s.step}-${i}`} tone={said.tone} data-step={s.step} data-verdict={s.verdict}>
              {said.words}
            </Said>
          )
        })}
      </ol>
    </Part>
  )
}

function TestBody({ answer }: { answer: TestAnswer }) {
  return (
    <>
      <Steps trace={answer} place="" />
      <Part title="Your devices">
        <ul>
          {devicesWords(answer.devices).map((d) => (
            <Said key={d.words} tone={d.tone}>
              {d.words}
            </Said>
          ))}
        </ul>
      </Part>
      <Deliveries rows={testDeliveries(answer)} />
    </>
  )
}

function WhyBody({ answer, place }: { answer: WhyAnswer; place: string }) {
  const many = answer.events.length > 1
  return (
    <>
      {answer.events.map((trace, i) => (
        <div key={trace.event_id || i} data-event="" className={cn("space-y-3", i > 0 && "border-t border-line pt-3")}>
          {many ? <p className="text-xs font-medium text-foreground">{i === 0 ? "The latest notice" : "An earlier notice"}</p> : null}
          <Steps trace={trace} place={place} />
          <Deliveries rows={trace.deliveries ?? []} waiting={trace.decision?.waiting} />
        </div>
      ))}
    </>
  )
}

/** Until a time has passed, then once more: Send again waits out a too-soon. */
function useUntil(iso: string | null): boolean {
  const at = iso ? Date.parse(iso) : 0
  const [passed, setPassed] = React.useState<number>(0)
  React.useEffect(() => {
    const wait = at - Date.now()
    if (wait <= 0) return
    const t = window.setTimeout(() => setPassed(at), wait + 50)
    return () => window.clearTimeout(t)
  }, [at])
  return at > 0 && passed !== at && at > Date.now()
}

/** The Inbox door's read of one message's record (GET /notify/why), as the panel's state: the record, none, offline, or how it failed. */
export function WhyRecordPanel({ answer, error, place, onAgain, ...door }: NotifyDoor & { answer?: WhyAnswer; error?: unknown; place: string; onAgain: () => void }) {
  const offline = React.useSyncExternalStore(subscribeConnectivity, isAppOffline, notOffline)
  const state: NotifyState<WhyAnswer> = answer
    ? answer.events?.length
      ? { status: "done", data: answer }
      : { status: "empty" }
    : offline
      ? { status: "offline" }
      : error
        ? failureOf(error)
        : { status: "loading" }
  return <NotifyWhyPanel kind="why" state={state} place={place} onAgain={onAgain} {...door} />
}
const notOffline = () => false

export function NotifyWhyPanel(props: NotifyWhyPanelProps) {
  const { kind, state, onAgain, onClose, door, id } = props
  // Its door is outside it: a press on the door is the door's (it closes), and a close no press elsewhere made gives
  // the focus back to the door, as a trigger's would.
  const pressedElsewhere = React.useRef(false)
  const at = React.useMemo(() => ({ current: door }), [door])
  const waiting = useUntil(state.status === "too_soon" ? state.retryAt : null)
  const loading = state.status === "loading"

  let title: string
  let sub: string | null = null
  let tone: Tone = "ok"
  let Icon = kind === "test" ? Bell : CircleHelp
  let body: React.ReactNode
  if (state.status === "done") {
    if (props.kind === "test") {
      const answer = props.state.status === "done" ? props.state.data : null
      title = answer ? testTitle(answer) : ""
      sub = "Each step it took to reach you."
      tone = answer?.told.length ? "ok" : "held"
      body = answer ? <TestBody answer={answer} /> : null
    } else {
      const answer = props.state.status === "done" ? props.state.data : null
      title = "Why am I seeing this?"
      const first = answer?.events[0]
      sub = `Because ${causeWords(first?.decision?.cause ?? first?.steps.find((s) => s.causes?.length)?.causes?.[0])}.`
      body = answer ? <WhyBody answer={answer} place={props.place} /> : null
    }
  } else {
    const said = stateWords(kind, state)
    title = said.title
    body = (
      <p role={loading ? "status" : undefined} className="text-sm leading-5 text-ink-2 text-pretty">
        {said.line}
      </p>
    )
    tone = loading ? "ok" : state.status === "too_soon" ? "held" : "off"
    Icon = loading ? Loader2 : state.status === "offline" ? WifiOff : state.status === "too_soon" ? Clock : state.status === "demo" ? BellOff : Icon
  }

  const again =
    kind === "test" ? (
      state.status === "demo" ? null : (
        <Button type="button" size="sm" onClick={onAgain} disabled={loading || waiting}>
          Send again
        </Button>
      )
    ) : state.status === "error" || state.status === "offline" || state.status === "too_soon" ? (
      <Button type="button" size="sm" variant="outline" onClick={onAgain} disabled={waiting}>
        Try again
      </Button>
    ) : null

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={at as React.RefObject<HTMLElement>} />
      <PopoverContent
        id={id}
        align="end"
        sideOffset={6}
        onInteractOutside={(e) => {
          const target = e.target as Node | null
          if (target && door?.contains(target)) e.preventDefault()
          else pressedElsewhere.current = true
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (!pressedElsewhere.current) door?.focus()
        }}
        aria-label={title}
        data-notify-why={kind}
        data-state-is={state.status}
        className="content-float flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-xl p-3 shadow-e3"
      >
        <OverlayHeader className="flex items-start gap-3 pb-3">
          <span aria-hidden="true" className={cn("grid size-9 shrink-0 place-items-center rounded-lg bg-hover", TONE[tone])}>
            <Icon className={cn("size-4", loading && "animate-spin motion-reduce:animate-none")} />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {sub ? <p className="mt-0.5 text-xs text-ink-3 text-pretty">{sub}</p> : null}
          </div>
        </OverlayHeader>
        <OverlayBody aria-live="polite" aria-busy={loading || undefined} className="space-y-3">
          {body}
        </OverlayBody>
        <OverlayFooter className="flex justify-end gap-1.5 pt-3">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
          {again}
        </OverlayFooter>
      </PopoverContent>
    </Popover>
  )
}
