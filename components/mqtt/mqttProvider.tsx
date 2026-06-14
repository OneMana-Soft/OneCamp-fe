"use client"

import React, {useCallback, useMemo, useRef, useState} from "react"
import { createContext, useContext, useEffect } from "react"
import {useMqttConnection} from "@/hooks/useMqttConnection";
import {useMqttMessageHandler} from "@/hooks/useMqttMessageHandler";
import {useMessageSyncManager} from "@/hooks/useMessageSyncManager";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {DynamicTopicManager, mqttConfigRes, MqttConnectionState, TopicSubscription} from "@/types/mqtt";
import {useDispatch, useSelector} from "react-redux";
import {updateUserConnectedDeviceCount, UserEmojiInterface} from "@/store/slice/userSlice";
import { pruneStaleTyping } from "@/store/slice/typingSlice";
import type {RootState} from "@/store/store";

interface MqttContextValue {
    connectionState: MqttConnectionState
    publish: (topic: string, message: string) => Promise<void>
    connect: () => void
    disconnect: () => void
    subscribeToTopic: (topic: string, callback: (message: string, topic: string) => void) => string
    unsubscribeFromTopic: (subscriptionId: string) => void
}


const MqttContext = createContext<MqttContextValue | null>(null)

export const useMqtt = () => {
    const context = useContext(MqttContext)
    if (!context) {
        throw new Error("useMqtt must be used within MqttProvider")
    }
    return context
}

interface MqttProviderProps {
    children: React.ReactNode
}

const EMPTY_USER_STATUS: UserEmojiInterface = { deviceConnected: 0 } as UserEmojiInterface

const MQTT_CONNECTION_CONFIG = {
    wsUrl: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8083",
    wsPort: process.env.NODE_ENV !== "development" ? 8084 : 8083,
    reconnectInterval: 1000,
    maxReconnectAttempts: 10, // Increased from 3: covers ~17min of retrying with exponential backoff. After that, handleVisibilityChange reconnects when user returns.
    typingTimeout: 4000,
}

export const MqttProvider: React.FC<MqttProviderProps> = ({ children }) => {

    const dispatch = useDispatch();
    const mqttConfigRes = useFetchOnlyOnce<{data: mqttConfigRes}>(GetEndpointUrl.GetMqttConfig);
    
    useEffect(() => {
        if (mqttConfigRes.isError) {
            console.error("[MQTT] Config fetch error:", mqttConfigRes.isError)
        }
    }, [mqttConfigRes.data, mqttConfigRes.isError])

    // MEMOIZE CONFIG: Prevent unstable object references from triggering hook re-runs
    const stableConfig = useMemo(() => mqttConfigRes.data?.data || null, [
        mqttConfigRes.data?.data?.ws_url,
        mqttConfigRes.data?.data?.clientId,
        mqttConfigRes.data?.data?.username,
        // The password rotation is what unblocks the connection hook's
        // auth-failure latch. Without it in the dep list, mutate() would
        // refresh the SWR cache but stableConfig would keep the old
        // password reference and the hook would never reconnect.
        mqttConfigRes.data?.data?.password,
    ])

    /**
     * Auth-failure recovery. The MQTT JWT lives in mqttConfigRes
     * (24h lifetime per business/Mqtt/mqttBusiness.go). When EMQX
     * rejects it (token expired, secret rotation, post-relogin user
     * drift), the connection hook calls back into here. We force-
     * revalidate the SWR cache so the BE issues a fresh JWT, which
     * cascades through stableConfig into the hook and clears the
     * "do-not-reconnect-with-these-creds" latch.
     *
     * If the broker keeps rejecting freshly-issued tokens, the
     * problem is environmental (JWT_SECRET drift between go-service
     * and EMQX, or the user's session was killed server-side). We
     * cap retries so we don't hammer /mqttConfig forever.
     */
    const authFailureCountRef = useRef(0)
    const lastAuthFailureAtRef = useRef(0)
    const MAX_AUTH_RETRIES = 3

    const handleAuthFailure = useCallback(() => {
        const now = Date.now()
        // Treat failures more than 5 minutes apart as independent
        // sessions (e.g. broker secret rotated long after a healthy
        // run); reset the counter in that case.
        if (now - lastAuthFailureAtRef.current > 5 * 60 * 1000) {
            authFailureCountRef.current = 0
        }
        lastAuthFailureAtRef.current = now
        authFailureCountRef.current += 1

        if (authFailureCountRef.current > MAX_AUTH_RETRIES) {
            console.error(
                "[MQTT] Broker rejected credentials after",
                MAX_AUTH_RETRIES,
                "fresh-token retries. Likely a JWT_SECRET mismatch between the API and EMQX, or the session was revoked. Stopping reconnection.",
            )
            return
        }

        console.warn(
            "[MQTT] Broker rejected credentials. Refreshing JWT via /mqttConfig (attempt",
            authFailureCountRef.current,
            "of",
            MAX_AUTH_RETRIES,
            ")...",
        )
        mqttConfigRes.mutate?.()
    }, [mqttConfigRes.mutate])

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const userUuid = selfProfile.data?.data.user_uuid
    const userStatusState = useSelector((state: RootState) => state.users.usersStatus[userUuid||''] || EMPTY_USER_STATUS);

    const messageHandler = useMqttMessageHandler({
        connectionConfig: MQTT_CONNECTION_CONFIG,
        userUuid,
    })

    // SYNC MANAGER: Tracks connection health and forces API refetch after stale reconnection
    const syncManager = useMessageSyncManager()

    const topicSubscriptionsRef = useRef<Map<string, TopicSubscription[]>>(new Map()) // Use Ref to avoid re-renders
    const subscriptionIdCounter = useRef(0)

    // FORCE UPDATE: We might need to force update if we want to visually debug, 
    // but for logic we don't need re-renders for subscription changes as they are handled by side-effects (MQTT).
    // However, if we want to be safe, we can use a dummy state to trigger re-renders only if absolutely necessary.
    // For now, let's try WITHOUT re-renders, as the subscription list is internal logic.

    const enhancedMessageHandler = useCallback(
        (topic: string, message: Buffer) => {
            // Mark MQTT connection as healthy (received a real message)
            syncManager.markHealthy()

            // Call the original message handler
            messageHandler.handleMessage(topic, message)

            // Route to dynamic topic subscriptions
            const subscriptions = topicSubscriptionsRef.current.get(topic)
            if (subscriptions) {
                const messageStr = message.toString()
                subscriptions.forEach((sub) => {
                    try {
                        sub.callback(messageStr, topic)
                    } catch (error) {
                        console.error("[MQTT] Dynamic subscription callback error:", error)
                    }
                })
            }
        },
        [messageHandler, syncManager.markHealthy], // Stable dependency
    )

    const dynamicTopicManager: DynamicTopicManager = useMemo(
        () => ({
            subscriptions: topicSubscriptionsRef.current, // Caution: this ref value might be stale in render but object ref is same
            subscribe: (topic: string, callback: (message: string, topic: string) => void) => {
                const id = `sub_${++subscriptionIdCounter.current}`
                const subscription: TopicSubscription = { topic, callback, id }

                const currentMap = topicSubscriptionsRef.current
                const existing = currentMap.get(topic) || []
                currentMap.set(topic, [...existing, subscription])
                
                return id
            },
            unsubscribe: (subscriptionId: string) => {
                const currentMap = topicSubscriptionsRef.current
                for (const [topic, subscriptions] of currentMap.entries()) {
                    const filtered = subscriptions.filter((sub) => sub.id !== subscriptionId)
                    if (filtered.length === 0) {
                        currentMap.delete(topic)
                    } else {
                        currentMap.set(topic, filtered)
                    }
                }
            },
            getTopicsToSubscribe: () => Array.from(topicSubscriptionsRef.current.keys()),
        }),
        [], // FULLY STABLE: No dependencies.
    )

    const onConnect = () => {
        dispatch(updateUserConnectedDeviceCount({
            userUUID: userUuid || '',
            deviceConnected: userStatusState.deviceConnected + 1
        }))
    }

    const onDisconnect = () => {
        syncManager.handleDisconnected()
        dispatch(updateUserConnectedDeviceCount({
            userUUID: userUuid || '',
            deviceConnected: userStatusState.deviceConnected-1
        }))
    }

    const onReconnect = () => {
        syncManager.handleConnectionEstablished()
    }

    const {
        connectionState,
        connect,
        disconnect,
        publish,
        subscribeToTopic: mqttSubscribe,
        unsubscribeFromTopic: mqttUnsubscribe,
    } = useMqttConnection({
        config: stableConfig,
        connectionConfig: MQTT_CONNECTION_CONFIG,
        onMessage: enhancedMessageHandler,
        onConnect: onConnect,
        onDisconnect: onDisconnect,
        onReconnect: onReconnect,
        onAuthFailure: handleAuthFailure,
        userUuid: userUuid,
        onError: (error) => console.error("[MQTT] Provider error:", error),
    })

    const handleSubscribeToTopic = useCallback(
        (topic: string, callback: (message: string, topic: string) => void) => {
            const subscriptionId = dynamicTopicManager.subscribe(topic, callback)

            // Ensure we are subscribed to the MQTT topic
            mqttSubscribe?.(topic)

            return subscriptionId
        },
        [dynamicTopicManager, mqttSubscribe],
    )

    const handleUnsubscribeFromTopic = useCallback(
        (subscriptionId: string) => {
            // We need to find the topic BEFORE unsubscribing to check if it becomes empty
            const currentMap = topicSubscriptionsRef.current
            let targetTopic: string | null = null

            for (const [topic, subscriptions] of currentMap.entries()) {
                if (subscriptions.some(sub => sub.id === subscriptionId)) {
                    targetTopic = topic
                    break
                }
            }

            if (targetTopic) {
                dynamicTopicManager.unsubscribe(subscriptionId)
                
                // After unsubscribe, check if topic is now empty
                // dynamicTopicManager deletes the key if empty, so check if key prevents or if array empty
                if (!currentMap.has(targetTopic) || currentMap.get(targetTopic)?.length === 0) {
                     mqttUnsubscribe?.(targetTopic)
                }
            }
        },
        [dynamicTopicManager, mqttUnsubscribe],
    )

    // Synchronization effect removed: We now handle subscriptions imperatively in handleSubscribe/Unsubscribe
    // to avoid state-based render loops.
    useEffect(() => {
        // No-op or cleanup if needed
    }, [])

    useEffect(() => {
        return () => {
            messageHandler.cleanup()
        }
    }, [messageHandler])

    /**
     * Foreground reconcile. When the tab/PWA returns to the foreground after
     * being idle, reconcile mounted conversations against the server —
     * independently of MQTT socket state. This is the safety net for the
     * iOS-PWA "zombie socket" case where the connection silently died while
     * backgrounded but mqtt.js still reports connected, so no reconnect event
     * (and thus no reconnect-driven resync) ever fires. See
     * useMessageSyncManager.handleForeground for the full rationale.
     */
    useEffect(() => {
        const onForeground = () => {
            if (document.visibilityState === "visible") {
                syncManager.handleForeground()
            }
        }
        document.addEventListener("visibilitychange", onForeground)
        window.addEventListener("focus", onForeground)
        return () => {
            document.removeEventListener("visibilitychange", onForeground)
            window.removeEventListener("focus", onForeground)
        }
    }, [syncManager.handleForeground])

    /**
     * Prune stale typing entries.
     *
     * Belt-and-braces fallback for the per-message setTimeout cleanup in
     * useTypingHandlers: when a PWA / mobile tab is backgrounded, the OS
     * suspends setTimeout callbacks (iOS Safari especially), so a typing
     * indicator that was set just before backgrounding stays "stuck" until
     * the suspended timer eventually catches up — sometimes seconds after
     * the user returns to the app. We sweep on a coarse interval and on
     * every visibility-change so a returning tab converges to a clean
     * state on its very next render.
     *
     * TTL is 1.5x the configured typingTimeout so we don't prune entries
     * that the per-message timer is already about to clear naturally.
     */
    useEffect(() => {
        const ttlMs = Math.round(MQTT_CONNECTION_CONFIG.typingTimeout * 1.5)
        const prune = () => dispatch(pruneStaleTyping({ ttlMs }))

        const interval = setInterval(prune, 2000)
        const onVisibility = () => {
            if (document.visibilityState === "visible") prune()
        }
        document.addEventListener("visibilitychange", onVisibility)
        window.addEventListener("focus", onVisibility)

        return () => {
            clearInterval(interval)
            document.removeEventListener("visibilitychange", onVisibility)
            window.removeEventListener("focus", onVisibility)
        }
    }, [dispatch])

    const contextValue: MqttContextValue = {
        connectionState,
        publish,
        connect,
        disconnect,
        subscribeToTopic: handleSubscribeToTopic,
        unsubscribeFromTopic: handleUnsubscribeFromTopic,
    }

    return <MqttContext.Provider value={contextValue}>{children}</MqttContext.Provider>
}
