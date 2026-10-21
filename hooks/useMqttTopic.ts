"use client"

import { useEffect, useRef } from "react"
import {useMqtt} from "@/components/mqtt/mqttContext";

interface UseMqttTopicOptions {
    topic: string
    /**
     * Called for each message on the topic, for what only this page does with
     * it. Most pages pass none: subscribing is what brings a topic's messages
     * in, and the global router (useMqttMessageHandler) handles each one
     * once. A page that handled them as well handled every event twice (a
     * doc's comment count moved by two).
     */
    onMessage?: (message: string, topic: string) => void
    autoSubscribe?: boolean
}

/**
 * Subscribes to an MQTT topic while mounted (and connected). It keeps no
 * list of the messages: it used to, in state, so every message on a doc's or
 * a table's topic rendered the whole page again, and the list only grew.
 */
export const useMqttTopic = ({ topic, onMessage, autoSubscribe = true }: UseMqttTopicOptions) => {
    const { subscribeToTopic, unsubscribeFromTopic, connectionState } = useMqtt()
    const subscriptionIdRef = useRef<string | null>(null)
    // The latest handler, so a new one each render needs no resubscribe.
    const onMessageRef = useRef(onMessage)
    useEffect(() => {
        onMessageRef.current = onMessage
    })

    useEffect(() => {
        if (!topic || !autoSubscribe || subscriptionIdRef.current || !connectionState.isConnected) return
        subscriptionIdRef.current = subscribeToTopic(topic, (message: string, receivedTopic: string) => {
            if (receivedTopic === topic) onMessageRef.current?.(message, receivedTopic)
        })
        return () => {
            if (subscriptionIdRef.current) {
                unsubscribeFromTopic(subscriptionIdRef.current)
                subscriptionIdRef.current = null
            }
        }
    }, [topic, autoSubscribe, subscribeToTopic, unsubscribeFromTopic, connectionState.isConnected])

    return { isConnected: connectionState.isConnected }
}
