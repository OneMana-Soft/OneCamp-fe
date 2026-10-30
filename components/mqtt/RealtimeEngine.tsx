"use client"

import React, {useCallback, useMemo, useRef} from "react"
import { useEffect } from "react"
import {useMqttConnection} from "@/hooks/useMqttConnection";
import {useMqttMessageHandler} from "@/hooks/useMqttMessageHandler";
import {useMessageSyncManager} from "@/hooks/useMessageSyncManager";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {DynamicTopicManager, mqttConfigRes, TopicLive, TopicSubscription} from "@/types/mqtt";
import {useDispatch, useSelector} from "react-redux";
import {updateUserConnectedDeviceCount, UserEmojiInterface} from "@/store/slice/userSlice";
import { pruneStaleTyping } from "@/store/slice/typingSlice";
import { TYPING_EXPIRY_MS, TYPING_STALE_MS } from "@/lib/typingTiming";
import type {RootState} from "@/store/store";
import type { SubscriptionDeps } from "@/lib/realtime/subscriptions";
import type { MqttContextValue } from "@/components/mqtt/mqttContext";
import { triggerMessageCatchUp, triggerMessageResync } from "@/store/slice/messageResyncSlice";

// The context and its readers live in mqttContext.ts, and every reader imports
// them from there: a page importing this file carries all its handlers
// (app/firstLoad.test.ts, "the realtime provider").

interface RealtimeEngineProps {
    /** Gives the light provider (mqttProvider.tsx) the connection to hand to its readers. */
    onValue: (value: MqttContextValue) => void
    /** Tells the light provider's conversation registry what the settings name, and how to ask for them again. */
    bindConversations: (deps: SubscriptionDeps) => void
}

/** A first connection later than this after the page began fetches what came in between, once. */
const LATE_FIRST_CONNECT_MS = 3000

const EMPTY_USER_STATUS: UserEmojiInterface = { deviceConnected: 0 } as UserEmojiInterface

const MQTT_CONNECTION_CONFIG = {
    wsUrl: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8083",
    wsPort: process.env.NODE_ENV !== "development" ? 8084 : 8083,
    reconnectInterval: 1000,
    // Reconnecting never gives up (lib/mqtt/reconnectDelay).
    typingTimeout: TYPING_EXPIRY_MS,
}

/**
 * The live connection and its handlers: 267 KB of source, a chunk of its own
 * that the light provider (mqttProvider.tsx) starts at the first idle moment,
 * so the first screen doesn't carry it (fluid-15). It renders nothing: it
 * hands its connection up (onValue) and tells the provider's conversation
 * registry what the settings name (bindConversations).
 */
export function RealtimeEngine({ onValue, bindConversations }: RealtimeEngineProps) {

    const dispatch = useDispatch();
    // Asked for on every mount: the credentials and topics are the signed-in
    // member's, so a copy from anywhere else (an earlier member's) mustn't
    // connect. The response cache never writes them down (lib/swrCache).
    const mqttConfigRes = useFetchOnlyOnce<{data: mqttConfigRes}>(GetEndpointUrl.GetMqttConfig, undefined, { revalidateOnMount: true });
    
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
        // The topics: a conversation started or joined since the last answer
        // is subscribed to without reconnecting (useMqttConnection).
        mqttConfigRes.data?.data?.topics?.join("\n"),
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
            ")…",
        )
        mqttConfigRes.mutate?.()
    }, [mqttConfigRes.mutate])

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const userUuid = selfProfile.data?.data.user_uuid
    const userStatusState = useSelector((state: RootState) => state.users.usersStatus[userUuid||''] || EMPTY_USER_STATUS);

    // The settings again, for the topics they name now: on a conversation
    // that became this member's or stopped being theirs (Conversation_Access).
    const refreshTopics = useCallback(() => {
        void mqttConfigRes.mutate?.()
    }, [mqttConfigRes.mutate])

    const messageHandler = useMqttMessageHandler({
        connectionConfig: MQTT_CONNECTION_CONFIG,
        userUuid,
        refreshTopics,
    })

    // Subscriptions by conversation (lib/realtime/subscriptions): a surface
    // showing one the settings don't name has them asked for again.
    const conversationTopicsRef = useRef<Record<string, string[]> | undefined>(undefined)
    const refreshTopicsRef = useRef(refreshTopics)
    useEffect(() => {
        conversationTopicsRef.current = mqttConfigRes.data?.data?.conversation_topics
        refreshTopicsRef.current = refreshTopics
    })
    useEffect(() => bindConversations({
        names: (key) => {
            const named = conversationTopicsRef.current
            return named ? key in named : undefined
        },
        refresh: () => refreshTopicsRef.current(),
    }), [bindConversations])

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
            subscribe: (topic: string, callback: (message: string, topic: string) => void, live?: TopicLive) => {
                const id = `sub_${++subscriptionIdCounter.current}`
                const subscription: TopicSubscription = { topic, callback, id, live }

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

    // The first connection comes after the first screen fetched its
    // conversations; when it comes late (a slow network, the engine's own
    // chunk), what was said in between is fetched once, as a reconnect does.
    const connectedOnce = useRef(false)
    const onConnect = () => {
        if (!connectedOnce.current) {
            connectedOnce.current = true
            if (performance.now() > LATE_FIRST_CONNECT_MS) dispatch(triggerMessageResync())
        }
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

    // The open conversations were read before this connection's subscriptions
    // were answered, early or late: each reads what came after its newest
    // message, once (useMessageCatchUp). A message sent in that gap was lost
    // on every cold open (FLUIDITY-LEAD-8, 22 Oct 2026).
    const onSubscribed = () => dispatch(triggerMessageCatchUp())

    // A topic went live: each page on it read before then, so it reads again
    // (TopicLive; F5, REGRESSION-HUNT 26 Oct).
    const onTopicLive = (topic: string) => topicSubscriptionsRef.current.get(topic)?.forEach((sub) => sub.live?.onLive())

    const {
        connectionState,
        connect,
        disconnect,
        reconnect,
        publish,
        subscribeToTopic: mqttSubscribe,
        unsubscribeFromTopic: mqttUnsubscribe,
        topicLiveAt,
    } = useMqttConnection({
        config: stableConfig,
        connectionConfig: MQTT_CONNECTION_CONFIG,
        onMessage: enhancedMessageHandler,
        onConnect: onConnect,
        onDisconnect: onDisconnect,
        onReconnect: onReconnect,
        onAuthFailure: handleAuthFailure,
        onSubscribed,
        onTopicLive,
        userUuid: userUuid,
        onError: (error) => console.error("[MQTT] Provider error:", error),
    })

    const handleSubscribeToTopic = useCallback(
        (topic: string, callback: (message: string, topic: string) => void, live?: TopicLive) => {
            const subscriptionId = dynamicTopicManager.subscribe(topic, callback, live)

            // Ensure we are subscribed to the MQTT topic
            mqttSubscribe?.(topic)

            // Live already, but only since the page opened: it read before.
            const at = topicLiveAt(topic)
            if (live && at !== undefined && at >= live.since) live.onLive()

            return subscriptionId
        },
        [dynamicTopicManager, mqttSubscribe, topicLiveAt],
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
     * TTL is TYPING_STALE_MS, past the expiry, so we don't prune entries
     * that the per-message timer is already about to clear naturally.
     */
    useEffect(() => {
        const prune = () => dispatch(pruneStaleTyping({ ttlMs: TYPING_STALE_MS }))

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

    // One object while nothing in it changes. A new one on every render of
    // this provider (a device count, a config answer, a typing sweep) re-rendered
    // everything that reads the connection, for nothing.
    const contextValue: MqttContextValue = useMemo(() => ({
        connectionState,
        publish,
        connect,
        disconnect,
        reconnect,
        subscribeToTopic: handleSubscribeToTopic,
        unsubscribeFromTopic: handleUnsubscribeFromTopic,
    }), [connectionState, publish, connect, disconnect, reconnect, handleSubscribeToTopic, handleUnsubscribeFromTopic])

    useEffect(() => onValue(contextValue), [contextValue, onValue])
    return null
}
