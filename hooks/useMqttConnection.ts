"use client"

import { useState, useEffect, useCallback, useRef } from "react"
// Types only: the library itself (about 400 KB) loads when a connection is
// first made, so it isn't part of the code every page needs to show.
import type { ClientSubscribeCallback, IClientPublishOptions, ISubscriptionMap, MqttClient } from "mqtt"
import { loadConnect } from "@/lib/mqtt/loadConnect"
import { RefusedTopicRetries, refusedTopics } from "@/lib/mqtt/subscriptionRetry"
import { reconnectDelay } from "@/lib/mqtt/reconnectDelay"
import { tabClientId } from "@/lib/mqtt/tabClientId"
import {ConnectionConfig, mqttConfigRes, MqttConnectionState} from "@/types/mqtt";
import { getCookie } from "@/lib/utils/helpers/getCookie";

// What mqtt.js hands a subscribe's callback: the error, the subscriptions, the SUBACK.
type SubscribeAnswer = Parameters<ClientSubscribeCallback>

interface UseMqttConnectionProps {
    config: mqttConfigRes | null
    connectionConfig: ConnectionConfig
    onMessage?: (topic: string, message: Buffer) => void
    onConnect?: () => void
    onDisconnect?: () => void
    onReconnect?: () => void
    onError?: (error: Error) => void
    /**
     * Fired when the broker rejects our credentials (CONNACK
     * "Bad User Name or Password" / "Not authorized"). The provider
     * uses this to revalidate the cached MQTT config (which holds a
     * 24h JWT) so a fresh token can be issued without forcing a tab
     * reload. The hook will not auto-reconnect after an auth failure
     * until a new `config` prop is passed in.
     */
    onAuthFailure?: () => void
    userUuid?: string
    dynamicTopicManager?: {
        getTopicsToSubscribe: () => string[]
        subscribeToTopic: (topic: string) => void
        unsubscribeFromTopic: (topic: string) => void
    }
}

export const useMqttConnection = ({
                                      config,
                                      connectionConfig,
                                      onMessage,
                                      onConnect,
                                      onDisconnect,
                                      onReconnect,
                                      onError,
                                      onAuthFailure,
                                      userUuid,
                                      dynamicTopicManager,
                                  }: UseMqttConnectionProps) => {
    const [connectionState, setConnectionState] = useState<MqttConnectionState>({
        isConnected: false,
        isConnecting: false,
        error: null,
        reconnectAttempts: 0,
    })

    const clientRef = useRef<MqttClient | null>(null)
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const schedulingReconnect = useRef<boolean>(false)
    const isManualDisconnect = useRef(false)
    const isUnmounted = useRef(false)
    const uniqueClientIdRef = useRef<string | null>(null)
    const connectionPending = useRef<boolean>(false)
    const settleDelayRef = useRef<NodeJS.Timeout | null>(null)
    const hasConnectedOnceRef = useRef<boolean>(false)
    /**
     * Fingerprint of the credentials currently being used by the
     * client. We refuse to reconnect with these exact creds again
     * after an auth failure — that would just spam the broker. The
     * provider must fetch fresh creds (mutate the SWR cache) and pass
     * a new `config` object whose fingerprint differs.
     */
    const lastAuthFailedCredsRef = useRef<string | null>(null)
    /**
     * Latest credential fingerprint we've observed. Lets the
     * effect-driven reconnect logic detect that the password rotated
     * and clear the auth-failure latch.
     */
    const currentCredsRef = useRef<string | null>(null)

    const clearReconnectTimeout = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
        }
    }, [])

    const updateConnectionState = useCallback(
        (updates: Partial<MqttConnectionState> | ((prev: MqttConnectionState) => Partial<MqttConnectionState>)) => {
            setConnectionState((prev) => {
                const newUpdates = typeof updates === "function" ? updates(prev) : updates
                return { ...prev, ...newUpdates }
            })
        },
        [],
    )

    const offlineBuffer = useRef<Array<{ topic: string, message: string, options: IClientPublishOptions, resolve: () => void, reject: (err: Error) => void }>>([])
    const pendingSubscriptions = useRef<Set<string>>(new Set())

    // A topic the broker refused is asked for again a few times, further apart
    // each time (lib/mqtt/subscriptionRetry), while the connection is up and
    // the page still wants it: one of the config's topics, a dynamic one
    // subscribed and not let go of since, or one the topic manager lists.
    const configTopicsRef = useRef<string[]>(config?.topics ?? [])
    // The settings' topics this connection holds. A later answer naming one it
    // doesn't (a conversation started, joined or added to since) is subscribed
    // to, and one it no longer names (left, removed, a group's old id) is let
    // go: without reconnecting, so nothing else on the connection is lost.
    const heldConfigTopics = useRef<Set<string>>(new Set())
    const dynamicTopicManagerRef = useRef(dynamicTopicManager)
    const wantedDynamicTopics = useRef<Set<string>>(new Set())
    useEffect(() => {
        configTopicsRef.current = config?.topics ?? []
        dynamicTopicManagerRef.current = dynamicTopicManager
    })
    const isWanted = useCallback(
        (topic: string) =>
            configTopicsRef.current.includes(topic) ||
            wantedDynamicTopics.current.has(topic) ||
            (dynamicTopicManagerRef.current?.getTopicsToSubscribe().includes(topic) ?? false),
        [],
    )
    const tryAgainRef = useRef<(topic: string) => void>(() => {})
    const [retries] = useState(
        () =>
            new RefusedTopicRetries(
                (topic) => tryAgainRef.current(topic),
                (topic, tries) =>
                    console.warn("[MQTT] Subscribe still refused for topic", topic, "after", tries, "tries; giving up until the next connection"),
            ),
    )

    // What a subscribe's answer means for those tries: a refused topic is tried
    // again later, if still wanted while connected; a granted one starts over.
    // Each caller still logs the answer itself.
    const settleSubscribe = useCallback(
        (topics: string[], err: SubscribeAnswer[0], granted?: SubscribeAnswer[1], suback?: SubscribeAnswer[2]) => {
            if (isUnmounted.current) return
            const refused = refusedTopics(topics, err, granted, suback)
            const answered = !err || Array.isArray(suback?.granted)
            for (const topic of topics) {
                if (refused.includes(topic)) {
                    if (clientRef.current?.connected && isWanted(topic)) retries.refused(topic)
                } else if (answered) {
                    retries.subscribed(topic)
                }
            }
        },
        [isWanted, retries],
    )

    const flushBuffer = useCallback(async () => {
        if (!clientRef.current || !connectionState.isConnected || offlineBuffer.current.length === 0) return

        const buffer = [...offlineBuffer.current]
        offlineBuffer.current = []

        for (const item of buffer) {
            try {
                await publish(item.topic, item.message, item.options)
                item.resolve()
            } catch (err) {
                console.error("[MQTT] Buffer flush error:", err)
                item.reject(err as Error)
            }
        }
    }, [connectionState.isConnected])

    const flushPendingSubscriptions = useCallback(() => {
        if (!clientRef.current || !clientRef.current.connected || pendingSubscriptions.current.size === 0) return

        const topics = Array.from(pendingSubscriptions.current)
        pendingSubscriptions.current.clear()

        topics.forEach((topic) => {
            if (clientRef.current && clientRef.current.connected) {
                clientRef.current.subscribe(topic, { qos: 1 }, (err, granted, suback) => {
                    settleSubscribe([topic], err, granted, suback)
                    if (err) {
                        // ACL rejection — log only, don't propagate as a
                        // fatal connection error.
                        console.warn(
                            "[MQTT] Queued subscribe rejected by broker ACL for topic",
                            topic,
                            "Error:",
                            err.message,
                        )
                        return
                    }
                    if (granted) {
                        granted.forEach((g) => {
                            if (typeof g.qos === "number" && g.qos >= 128) {
                                console.warn(
                                    "[MQTT] Queued subscribe denied for topic",
                                    g.topic,
                                    "reason code",
                                    g.qos,
                                )
                            }
                        })
                    }
                })
            }
        })
    }, [settleSubscribe])

    const connectionStabilityTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const handleConnect = useCallback(() => {
        connectionPending.current = false
        updateConnectionState({
            isConnected: true,
            isConnecting: false,
            error: null,
            // Do NOT reset reconnectAttempts immediately. Wait for stability.
        })
        
        // STABILITY TIMER: Only reset reconnect attempts if we stay connected for 5 seconds.
        if (connectionStabilityTimeoutRef.current) clearTimeout(connectionStabilityTimeoutRef.current)
        connectionStabilityTimeoutRef.current = setTimeout(() => {
            if (isUnmounted.current) return
            setConnectionState(prev => ({ ...prev, reconnectAttempts: 0 }))
            // console.log("[MQTT] Connection stable, reconnect counter reset")
        }, 5000)

        // RECONNECTION TRACKING: Fire onReconnect if this is NOT the first connection
        if (hasConnectedOnceRef.current) {
            onReconnect?.()
        } else {
            hasConnectedOnceRef.current = true
        }

        onConnect?.()
        flushBuffer()
        flushPendingSubscriptions()
    }, [onConnect, onReconnect, updateConnectionState, flushBuffer, flushPendingSubscriptions])

    const handleDisconnect = useCallback(() => {
        // failed connection, so clear the stability timer
        if (connectionStabilityTimeoutRef.current) {
            clearTimeout(connectionStabilityTimeoutRef.current)
            connectionStabilityTimeoutRef.current = null
        }
        // Nothing is tried again on a connection that's gone; the next one
        // subscribes to everything afresh.
        retries.reset()

        connectionPending.current = false
        updateConnectionState({
            isConnected: false,
            isConnecting: false,
        })
        onDisconnect?.()

        if (!isManualDisconnect.current && !schedulingReconnect.current) {
            schedulingReconnect.current = true
            setConnectionState((prev) => {
                // Never gives up: the fast tries, then one every 30 s, each a
                // little apart from other clients' (lib/mqtt/reconnectDelay).
                // The pill offers Reconnect once the fast tries are spent.
                const delay = reconnectDelay(prev.reconnectAttempts)

                // Clear any existing timeout before setting a new one
                clearReconnectTimeout()

                reconnectTimeoutRef.current = setTimeout(() => {
                    if (isUnmounted.current) {
                        return
                    }
                    schedulingReconnect.current = false
                    updateConnectionState({
                        reconnectAttempts: prev.reconnectAttempts + 1,
                        isConnecting: true,
                    })
                    connect()
                }, delay)
                // Return original state or partial updates, but keep it PURE
                return prev
            })
        }
    }, [onDisconnect, updateConnectionState, retries])

    const handleError = useCallback(
        (error: Error) => {
            console.error("[MQTT] Connection error:", error)
            connectionPending.current = false

            const msg = error?.message || ""
            // EMQX surfaces credential rejection as either "Bad User Name
            // or Password" (CONNACK 0x04 in v3.1.1, 0x86/0x87 in v5) or
            // "Not authorized". Both mean: the JWT we sent is no longer
            // valid (expired, broker secret rotation, user-context drift
            // after re-login). Latch the failure so we stop hammering
            // the broker, and ask the provider for fresh credentials.
            const isAuthFailure =
                msg.includes("Bad User Name or Password") ||
                msg.includes("Not authorized") ||
                msg.includes("not authorized")

            if (isAuthFailure) {
                // Remember which creds were rejected so we don't retry
                // them on a tab-focus event.
                if (currentCredsRef.current) {
                    lastAuthFailedCredsRef.current = currentCredsRef.current
                }
                // Stop the auto-reconnect chain; we'll restart only when
                // the provider hands us fresh credentials via the
                // `config` prop.
                isManualDisconnect.current = true
                clearReconnectTimeout()

                updateConnectionState({
                    error: msg,
                    isConnecting: false,
                    isConnected: false,
                    reconnectAttempts: 0,
                })

                // Best-effort cleanup of the rejected client so it doesn't
                // sit in CLOSED state holding the slot.
                if (clientRef.current) {
                    try {
                        clientRef.current.end(true)
                    } catch {
                        /* ignore — client already torn down */
                    }
                    clientRef.current = null
                }

                onAuthFailure?.()
                onError?.(error)
                return
            }

            if (msg.includes("Connection closed") || msg.includes("Connection refused")) {
                handleDisconnect()
            }

            updateConnectionState({
                error: msg,
                isConnecting: false,
            })
            onError?.(error)
        },
        [onError, onAuthFailure, updateConnectionState, handleDisconnect, clearReconnectTimeout],
    )

    // STABILITY REFS: Keep latest references to avoid dependency churn
    const latestHandleErrorRef = useRef(handleError)
    const latestConnectionStateRef = useRef(connectionState)
    const latestOnMessageRef = useRef(onMessage)

    useEffect(() => {
        latestHandleErrorRef.current = handleError
        latestConnectionStateRef.current = connectionState
        latestOnMessageRef.current = onMessage
    })

    // Trying a refused topic again: only on a live connection, and only a
    // topic the page still wants.
    useEffect(() => {
        tryAgainRef.current = (topic: string) => {
            const client = clientRef.current
            if (!client || !client.connected) return
            if (!isWanted(topic)) {
                retries.forget(topic)
                return
            }
            client.subscribe(topic, { qos: 1 }, (err, granted, suback) => {
                if (err) console.warn("[MQTT] Subscribe tried again and refused for topic", topic, "Error:", err.message)
                settleSubscribe([topic], err, granted, suback)
            })
        }
    })

    const handleMessage = useCallback(
        (topic: string, message: Buffer) => {
            try {
                latestOnMessageRef.current?.(topic, message)
            } catch (error) {
                console.error("[MQTT] Message handling error:", error)
                latestHandleErrorRef.current(error as Error)
            }
        },
        [], // Fully stable: uses refs
    )

    const subscribeToTopics = useCallback(
        (client: MqttClient, topics: string[]) => {
            if (!topics.length) return

            const subscriptions: ISubscriptionMap = {}
            topics.forEach((topic) => {
                subscriptions[topic] = { qos: 1 }
            })

            client.unsubscribe(topics, (err) => {
                if (err) {
                    // console.warn("[MQTT] Unsubscribe warning:", err)
                }
            })

            client.subscribe(subscriptions, (err, granted, suback) => {
                // Refused topics are tried again later (settleSubscribe).
                settleSubscribe(topics, err, granted, suback)
                if (err) {
                    // SubackPacket with non-zero reason codes (e.g. "Not
                    // authorized" 0x87) lands here. The connection itself
                    // is healthy — the broker is just refusing this
                    // particular topic per its ACL. We log the failure
                    // but do NOT propagate as a fatal connection error.
                    console.warn(
                        "[MQTT] Subscribe rejected by broker ACL. Topics:",
                        topics,
                        "Error:",
                        err.message,
                    )
                    return
                }
                if (granted) {
                    granted.forEach((g) => {
                        // qos values >= 128 indicate failure (e.g. 0x87
                        // Not authorized, 0x8F Topic filter invalid).
                        if (typeof g.qos === "number" && g.qos >= 128) {
                            console.warn(
                                "[MQTT] Subscribe denied for topic",
                                g.topic,
                                "reason code",
                                g.qos,
                            )
                        }
                    })
                }
            })
        },
        [settleSubscribe], // Stable: uses refs, and settleSubscribe never changes
    )

    const subscribeToTopic = useCallback(
        (topic: string) => {
            wantedDynamicTopics.current.add(topic)
            // Use Safe Refs to prevent identity change of this function
            const isConnected = latestConnectionStateRef.current.isConnected

            if (!clientRef.current || !isConnected || !clientRef.current.connected) {
                // Queue the subscription for when the client connects
                pendingSubscriptions.current.add(topic)
                return
            }

            clientRef.current.subscribe(topic, { qos: 1 }, (err, granted, suback) => {
                settleSubscribe([topic], err, granted, suback)
                if (err) {
                    // ACL rejection — log but don't blow up the
                    // connection. Other topics on this client remain
                    // valid.
                    console.warn(
                        "[MQTT] Dynamic subscribe rejected by broker ACL for topic",
                        topic,
                        "Error:",
                        err.message,
                    )
                    return
                }
                if (granted) {
                    granted.forEach((g) => {
                        if (typeof g.qos === "number" && g.qos >= 128) {
                            console.warn(
                                "[MQTT] Dynamic subscribe denied for topic",
                                g.topic,
                                "reason code",
                                g.qos,
                            )
                        }
                    })
                }
            })
        },
        [settleSubscribe], // FULLY STABLE: settleSubscribe never changes.
    )

    const unsubscribeFromTopic = useCallback((topic: string) => {
        // Remove from pending subscriptions if it's queued
        pendingSubscriptions.current.delete(topic)
        // No longer wanted: not tried again if it was refused.
        wantedDynamicTopics.current.delete(topic)
        retries.forget(topic)

        if (!clientRef.current) {
            return
        }

        clientRef.current.unsubscribe(topic, (err) => {
            if (err) {
                console.error("[MQTT] Dynamic unsubscribe error:", err)
            }
        })
    }, [retries])

    const connect = useCallback(() => {
        // What the client is doing now, not what the render this function
        // came from said: a timer or a listener set up renders ago calls it.
        // (A tab back from the background with a dead socket that still
        // read as connected used to be refused here, and stayed dead.)
        if (!config || connectionPending.current || clientRef.current?.connected) {
            return
        }

        // Fingerprint the credentials we're about to use. If they
        // match the last set the broker rejected, refuse to retry —
        // it would just produce another "Bad User Name or Password".
        // The provider will mutate() the config SWR cache after
        // onAuthFailure fires, which propagates a new fingerprint and
        // unblocks this guard.
        const credsFingerprint = `${config.username}::${config.password}`
        if (lastAuthFailedCredsRef.current === credsFingerprint) {
            return
        }
        currentCredsRef.current = credsFingerprint

        try {
            connectionPending.current = true
            updateConnectionState({ isConnecting: true, error: null })
            isManualDisconnect.current = false

            // If backend provides ws_url, it likely includes the port or is a complete URL
            const finalWsUrl = config.ws_url || connectionConfig.wsUrl
            
            // Explicitly decompose URL to prevent mqtt.js from "eating" the port
            let host = "localhost"
            let port = connectionConfig.wsPort
            let path = "/mqtt"
            let protocol: "ws" | "wss" = "ws"

            try {
                const urlObj = new URL(finalWsUrl)
                host = urlObj.hostname
                port = urlObj.port ? parseInt(urlObj.port) : (urlObj.protocol === "wss:" ? 443 : 80)
                path = urlObj.pathname + urlObj.search
                protocol = urlObj.protocol.replace(":", "") as any
            } catch {
                // Ignore URL parsing errors
            }

            // FORCE SECURE PROTOCOL: If page is HTTPS, force 'wss' and secure port fallback
            if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
                if (protocol !== 'wss') {
                    console.warn("[MQTT] Upgrading insecure connection to WSS for HTTPS environment");
                    protocol = 'wss';
                    // Upgrade standard emqx/ws ports to their secure counterparts if defaults are used
                    if (port === 8083) port = 8084;
                    else if (port === 80) port = 443;
                }
            }

            // KILL ZOMBIE CLIENTS: Ensure any previous connection is fully terminated
            if (clientRef.current) {
                clientRef.current.removeAllListeners()
                clientRef.current.end(true)
                clientRef.current = null
            }

            // UNIQUE ID PER TAB:
            // Each browser tab gets its own stable ID (lib/mqtt/tabClientId).
            // This prevents session takeover when multiple tabs are open (same clientId + clean:false
            // causes EMQX to kick the old connection, triggering "Connection closed" errors).
            // A reload of the tab reuses the ID (maintaining session persistence); a duplicated tab,
            // which copies the first one's sessionStorage, takes a new one.
            const deviceId = getCookie("deviceID")?.slice(0, 8) || "dev"
            const userSlice = userUuid?.slice(0, 8) || 'shared'

            // SETTLE DELAY: Give the broker/OS a moment to finalize any previous 'end(true)'
            if (settleDelayRef.current) clearTimeout(settleDelayRef.current)
            settleDelayRef.current = setTimeout(async () => {
                settleDelayRef.current = null
                if (isUnmounted.current) {
                    connectionPending.current = false
                    return
                }

                try {
                    const [connect, tabId] = await Promise.all([loadConnect(), tabClientId()])
                    uniqueClientIdRef.current = `c_${deviceId}_${userSlice}_${tabId}`
                    // The first connection waits for the library: the page may
                    // have gone in the meantime.
                    if (isUnmounted.current) {
                        connectionPending.current = false
                        return
                    }
                    const client = connect({
                        host,
                        port,
                        path,
                        protocol,
                        clientId: uniqueClientIdRef.current as string, // Cast to string for Type safety
                        username: config.username,
                        password: config.password,
                        clean: false, // MQTT v5: cleanStart = false, meaning resume session if exists
                        properties: {
                            sessionExpiryInterval: 3600, // Keep session for 1 hour
                        } as any, // Cast to any because TS might be using v4 types locally
                        protocolVersion: 5,
                        keepalive: 60,
                        connectTimeout: 45000, 
                        reconnectPeriod: 0,
                    })

                    // ATTACH ERROR LISTENER IMMEDIATELY to prevent "Uncaught" bubbles.
                    // Auth-failure latching, manual-disconnect bookkeeping, and
                    // credential refresh signaling all live in handleError to
                    // keep one source of truth.
                    client.on("error", (err: any) => {
                        handleError(err)
                    })

                    client.on("connect", () => {
                        // A new connection subscribes to everything afresh, so
                        // tries at refused topics start over.
                        retries.reset()
                        handleConnect()
                        // The latest settings' topics, not those this
                        // connection was first made with: a conversation
                        // started or joined since is among them.
                        const configTopics = configTopicsRef.current
                        heldConfigTopics.current = new Set(configTopics)
                        // And every topic the page took up since it loaded and
                        // still wants (a doc or a table open): a session the
                        // broker didn't keep (a restart, an hour away) holds
                        // none of them, and they went deaf.
                        const dynamicTopics = [...wantedDynamicTopics.current, ...(dynamicTopicManager?.getTopicsToSubscribe() || [])]
                        const allTopics = [...new Set([...configTopics, ...dynamicTopics])]
                        subscribeToTopics(client, allTopics)
                    })

                    client.on("reconnect", () => {
                    })

                    client.on("close", () => {
                        handleDisconnect()
                    })

                    client.on("offline", () => {
                    })

                    client.on("message", handleMessage)

                    clientRef.current = client
                } catch (mqttError) {
                    connectionPending.current = false
                    handleError(mqttError as Error)
                }
            }, 100)
        } catch (error) {
            handleError(error as Error)
        }
    }, [
        config,
        connectionConfig,
        handleConnect,
        handleDisconnect,
        handleError,
        handleMessage,
        subscribeToTopics,
        updateConnectionState,
        dynamicTopicManager,
        retries,
    ])

    const disconnect = useCallback(() => {
        isManualDisconnect.current = true
        clearReconnectTimeout()
        retries.reset()

        if (clientRef.current) {
            clientRef.current.end(true)
            clientRef.current = null
        }

        updateConnectionState({
            isConnected: false,
            isConnecting: false,
            reconnectAttempts: 0,
        })
    }, [clearReconnectTimeout, updateConnectionState, retries])

    const publish = useCallback(
        (topic: string, message: string, options: IClientPublishOptions = { qos: 0 }) => {
            return new Promise<void>((resolve, reject) => {
                if (!clientRef.current || !connectionState.isConnected) {
                    offlineBuffer.current.push({ topic, message, options, resolve, reject })
                    return
                }

                clientRef.current.publish(topic, message, options, (err) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })
        },
        [connectionState.isConnected],
    )

    useEffect(() => {
        // Initial connect only. Reconnects are handled by handleDisconnect & handleConnect.
        // When `config` rotates (e.g. provider mutate()'d after an auth failure), we
        // detect the new credential fingerprint, clear the latch, and try again.
        if (!config) return

        const incomingFingerprint = `${config.username}::${config.password}`
        if (
            lastAuthFailedCredsRef.current &&
            lastAuthFailedCredsRef.current !== incomingFingerprint
        ) {
            // Fresh creds delivered. Reset the latch and unmute the
            // auto-reconnect chain so the next connect() call proceeds.
            lastAuthFailedCredsRef.current = null
            isManualDisconnect.current = false
            updateConnectionState({ error: null, reconnectAttempts: 0 })
        }

        if (
            !connectionState.isConnected &&
            !connectionState.isConnecting &&
            connectionState.reconnectAttempts === 0 &&
            !isManualDisconnect.current
        ) {
            connect()
        }
    }, [config, connectionState.isConnected, connectionState.isConnecting, connectionState.reconnectAttempts, connect, updateConnectionState])

    // Try now rather than when the wait is up: the network or the tab came
    // back, or the person asked (the pill's Reconnect). A try already waiting
    // is dropped, so there's one try, not two clients racing for the session.
    const reconnectNow = useCallback(() => {
        if (isManualDisconnect.current || lastAuthFailedCredsRef.current) return
        if (clientRef.current?.connected) return
        clearReconnectTimeout()
        schedulingReconnect.current = false
        updateConnectionState({ reconnectAttempts: 0, isConnecting: true })
        connect()
    }, [connect, clearReconnectTimeout, updateConnectionState])

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== "visible") return
            // Don't fight EMQX: if we last failed with rejected credentials,
            // only reconnect after the provider has delivered fresh ones (the
            // config-rotation effect above will clear isManualDisconnect when
            // that happens).
            if (isManualDisconnect.current || lastAuthFailedCredsRef.current) return
            if (clientRef.current?.connected) return
            // ZOMBIE-SOCKET DETECTION (iOS PWA): after the OS suspends a
            // backgrounded tab the WebSocket can die WITHOUT firing 'close', so
            // our state still reads connected while the client is dead. Trust
            // the client over the flag: tear the zombie down and reconnect, so
            // the stream (and the reconnect-driven resync) actually resumes.
            if (clientRef.current && latestConnectionStateRef.current.isConnected) {
                clientRef.current.removeAllListeners()
                clientRef.current.end(true)
                clientRef.current = null
                connectionPending.current = false
                updateConnectionState({ isConnected: false })
            }
            reconnectNow()
        }

        // NETWORK RETURNED: the browser's own online signal is the cheapest,
        // most reliable "try again now" there is, rather than waiting out the
        // backoff in a foreground tab.
        const handleOnline = () => reconnectNow()

        document.addEventListener("visibilitychange", handleVisibilityChange)
        window.addEventListener("focus", handleVisibilityChange)
        window.addEventListener("online", handleOnline)

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange)
            window.removeEventListener("focus", handleVisibilityChange)
            window.removeEventListener("online", handleOnline)
        }
    }, [reconnectNow, updateConnectionState])

    // A later settings answer: subscribe to the topics it names that this
    // connection doesn't hold, and let go of those it no longer names (unless
    // the page still wants one for itself). See heldConfigTopics.
    const topicsKey = (config?.topics ?? []).join("\n")
    useEffect(() => {
        const client = clientRef.current
        if (!client || !client.connected) return
        const next = new Set(topicsKey ? topicsKey.split("\n") : [])
        const held = heldConfigTopics.current
        const added = [...next].filter((topic) => !held.has(topic))
        const gone = [...held].filter((topic) => !next.has(topic) && !wantedDynamicTopics.current.has(topic) &&
            !(dynamicTopicManagerRef.current?.getTopicsToSubscribe().includes(topic) ?? false))
        heldConfigTopics.current = next
        if (added.length) subscribeToTopics(client, added)
        if (gone.length) {
            for (const topic of gone) retries.forget(topic)
            client.unsubscribe(gone, (err) => {
                if (err) console.warn("[MQTT] Unsubscribe from topics no longer ours failed:", err.message)
            })
        }
    }, [topicsKey, subscribeToTopics, retries])

    useEffect(() => {
        isUnmounted.current = false
        return () => {
            isUnmounted.current = true
            connectionPending.current = false
            retries.reset()
            if (settleDelayRef.current) {
                clearTimeout(settleDelayRef.current)
                settleDelayRef.current = null
            }
            if (clientRef.current) {
                clearReconnectTimeout()
                clientRef.current.end(true)
                clientRef.current = null
            }
            if (connectionStabilityTimeoutRef.current) {
                clearTimeout(connectionStabilityTimeoutRef.current)
                connectionStabilityTimeoutRef.current = null
            }
        }
    }, [clearReconnectTimeout, retries])

    return {
        connectionState,
        connect,
        disconnect,
        reconnect: reconnectNow,
        publish,
        client: clientRef.current,
        subscribeToTopic,
        unsubscribeFromTopic,
    }
}
