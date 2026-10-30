"use client"

import { useEffect, useRef, useState } from "react"
import {useMqtt} from "@/components/mqtt/mqttContext";

interface UseMqttTopicOptions {
    topic: string
    /**
     * For what only this page does with each message. Most pass none: the
     * app's router (useMqttMessageHandler) handles every one once, and a page
     * that handled them too counted each twice.
     */
    onMessage?: (message: string, topic: string) => void
    /** Reads what the page shows from the topic again once it's live (TopicLive). */
    onLive?: () => void
}

/**
 * Subscribes to an MQTT topic while mounted and connected. It keeps no list
 * of the messages: one kept in state drew the whole page again on each.
 */
export const useMqttTopic = ({ topic, onMessage, onLive }: UseMqttTopicOptions) => {
    const { subscribeToTopic, unsubscribeFromTopic, connectionState } = useMqtt()
    const subscriptionIdRef = useRef<string | null>(null)
    // The latest handlers, so new ones each render need no resubscribe.
    const latest = useRef({ onMessage, onLive })
    useEffect(() => {
        latest.current = { onMessage, onLive }
    })
    const [since] = useState(() => performance.now())

    useEffect(() => {
        if (!topic || subscriptionIdRef.current || !connectionState.isConnected) return
        subscriptionIdRef.current = subscribeToTopic(
            topic,
            (message: string, receivedTopic: string) => {
                if (receivedTopic === topic) latest.current.onMessage?.(message, receivedTopic)
            },
            { since, onLive: () => latest.current.onLive?.() },
        )
        return () => {
            if (subscriptionIdRef.current) {
                unsubscribeFromTopic(subscriptionIdRef.current)
                subscriptionIdRef.current = null
            }
        }
    }, [topic, subscribeToTopic, unsubscribeFromTopic, connectionState.isConnected, since])
}
