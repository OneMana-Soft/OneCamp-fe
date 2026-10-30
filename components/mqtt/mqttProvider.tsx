"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { whenIdle } from "@/lib/whenIdle"
import { RealtimeContext } from "@/lib/realtime/context"
import { createRealtimeSubscriptions, type SubscriptionDeps } from "@/lib/realtime/subscriptions"
import { MqttContext, type MqttContextValue } from "@/components/mqtt/mqttContext"

// The live connection for the signed-in app. This provider is light: it gives
// its readers the context (components/mqtt/mqttContext) and the conversation
// registry at once, and starts the connection and its handlers
// (RealtimeEngine, 267 KB of source) at the first idle moment, a chunk of
// their own, so the first screen doesn't carry them (fluid-15). Until then
// the connection reads as connecting: nothing subscribes to a topic before
// it is connected (hooks/useMqttTopic), and the foot pill says nothing about
// a connection that was never live.
//
// Every reader imports the context from mqttContext.ts: a page importing the
// engine would carry all its handlers (app/firstLoad.test.ts, "the realtime
// provider").

const NOT_YET: MqttContextValue = {
    connectionState: { isConnected: false, isConnecting: true, error: null, reconnectAttempts: 0 },
    publish: () => Promise.reject(new Error("Live updates aren't connected yet.")),
    connect: () => {},
    disconnect: () => {},
    reconnect: () => {},
    subscribeToTopic: () => "",
    unsubscribeFromTopic: () => {},
}

/**
 * How long the engine waits for an idle moment before it starts anyway. Two
 * measures count it as loaded on every page because it starts this soon
 * (docFirstLoad's HOME, the endpoints guard's shellFiles): a much longer wait
 * would make them wrong.
 */
const START_BY_MS = 1500

type EngineProps = { onValue: (value: MqttContextValue) => void; bindConversations: (deps: SubscriptionDeps) => void }

// Its code couldn't come: live updates stay off, and it tries again when the
// browser is back online (lib/lazy/lazyPart). Pages still load what they show.
const engine = lazyPart<EngineProps>(() => import("@/components/mqtt/RealtimeEngine").then((m) => m.RealtimeEngine))

export function MqttProvider({ children }: { children: React.ReactNode }) {
    const [value, setValue] = useState<MqttContextValue>(NOT_YET)
    // What the settings name and how to ask for them again: the engine's, once it runs.
    const deps = useRef<SubscriptionDeps | null>(null)
    const conversations = useMemo(
        () =>
            createRealtimeSubscriptions({
                names: (key) => deps.current?.names(key),
                refresh: () => deps.current?.refresh(),
            }),
        [],
    )
    const bindConversations = useCallback((next: SubscriptionDeps) => {
        deps.current = next
    }, [])
    const [started, setStarted] = useState(false)
    useEffect(() => whenIdle(() => setStarted(true), START_BY_MS), [])
    // One element while started holds: the engine hands its connection up
    // (setValue), and drawing it again for that would hand up the next.
    const running = useMemo(
        () => (started ? <engine.Part onValue={setValue} bindConversations={bindConversations} /> : null),
        [started, bindConversations],
    )
    return (
        <MqttContext.Provider value={value}>
            <RealtimeContext.Provider value={conversations}>{children}</RealtimeContext.Provider>
            {running}
        </MqttContext.Provider>
    )
}
