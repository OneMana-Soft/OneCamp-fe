import { createContext, useContext } from "react"

import type { MqttConnectionState, TopicLive } from "@/types/mqtt"

// The live connection's context, apart from its provider (mqttProvider.tsx),
// which brings every realtime handler with it: a reader of the state (the
// offline notice, on every page, signed in or not) needs only this.

export interface MqttContextValue {
    connectionState: MqttConnectionState
    publish: (topic: string, message: string) => Promise<void>
    connect: () => void
    disconnect: () => void
    /** Tries to reconnect now, rather than when the next wait is up. */
    reconnect: () => void
    subscribeToTopic: (topic: string, callback: (message: string, topic: string) => void, live?: TopicLive) => string
    unsubscribeFromTopic: (subscriptionId: string) => void
}

export const MqttContext = createContext<MqttContextValue | null>(null)

/** The live connection's state, or undefined outside the signed-in app (no provider there). */
export const useMqttConnectionState = () => useContext(MqttContext)?.connectionState

/** Reconnect now (the pill's action), or undefined outside the signed-in app. */
export const useMqttReconnect = () => useContext(MqttContext)?.reconnect

export const useMqtt = () => {
    const context = useContext(MqttContext)
    if (!context) {
        throw new Error("useMqtt must be used within MqttProvider")
    }
    return context
}
