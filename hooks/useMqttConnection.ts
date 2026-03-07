"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import mqtt, { type MqttClient, type ISubscriptionMap } from "mqtt"
import {ConnectionConfig, mqttConfigRes, MqttConnectionState} from "@/types/mqtt";
import { getCookie } from "@/lib/utils/helpers/getCookie";

interface UseMqttConnectionProps {
    config: mqttConfigRes | null
    connectionConfig: ConnectionConfig
    onMessage?: (topic: string, message: Buffer) => void
    onConnect?: () => void
    onDisconnect?: () => void
    onReconnect?: () => void
    onError?: (error: Error) => void
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

    const offlineBuffer = useRef<Array<{ topic: string, message: string, options: mqtt.IClientPublishOptions, resolve: () => void, reject: (err: Error) => void }>>([])
    const pendingSubscriptions = useRef<Set<string>>(new Set())

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
                clientRef.current.subscribe(topic, { qos: 1 }, (err) => {
                    if (err) {
                        console.error("[MQTT] Queued subscription error:", err)
                        latestHandleErrorRef.current(new Error(`Failed to subscribe to queued topic ${topic}: ${err.message}`))
                    }
                })
            }
        })
    }, [])

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

        connectionPending.current = false
        updateConnectionState({
            isConnected: false,
            isConnecting: false,
        })
        onDisconnect?.()

        if (!isManualDisconnect.current && !schedulingReconnect.current) {
            schedulingReconnect.current = true
            setConnectionState((prev) => {
                if (prev.reconnectAttempts < connectionConfig.maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, prev.reconnectAttempts), 30000)

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
                } else {
                    console.error("[MQTT] Max reconnection attempts reached")
                    schedulingReconnect.current = false
                }
                // Return original state or partial updates, but keep it PURE
                return prev
            })
        }
    }, [connectionConfig.maxReconnectAttempts, onDisconnect, updateConnectionState])

    const handleError = useCallback(
        (error: Error) => {
            console.error("[MQTT] Connection error:", error)
            connectionPending.current = false
            
            if (error.message.includes("Connection closed") || error.message.includes("Connection refused")) {
                handleDisconnect()
            }

            updateConnectionState({
                error: error.message,
                isConnecting: false,
            })
            onError?.(error)
        },
        [onError, updateConnectionState, handleDisconnect],
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

            client.subscribe(subscriptions, (err) => {
                if (err) {
                    console.error("[MQTT] Subscribe error:", err)
                    latestHandleErrorRef.current(new Error(`Failed to subscribe: ${err.message}`))
                }
            })
        },
        [], // Stable: uses refs
    )

    const subscribeToTopic = useCallback(
        (topic: string) => {
            // Use Safe Refs to prevent identity change of this function
            const isConnected = latestConnectionStateRef.current.isConnected
            const callHandleError = latestHandleErrorRef.current

            if (!clientRef.current || !isConnected || !clientRef.current.connected) {
                // Queue the subscription for when the client connects
                pendingSubscriptions.current.add(topic)
                return
            }

            clientRef.current.subscribe(topic, { qos: 1 }, (err) => {
                if (err) {
                    console.error("[MQTT] Dynamic subscribe error:", err)
                    if (err.message.includes("Connection closed")) {
                         // internal state update if needed
                    }
                    callHandleError(new Error(`Failed to subscribe to ${topic}: ${err.message}`))
                }
            })
        },
        [], // FULLY STABLE: No dependencies.
    )

    const unsubscribeFromTopic = useCallback((topic: string) => {
        // Remove from pending subscriptions if it's queued
        pendingSubscriptions.current.delete(topic)

        if (!clientRef.current) {
            return
        }

        clientRef.current.unsubscribe(topic, (err) => {
            if (err) {
                console.error("[MQTT] Dynamic unsubscribe error:", err)
            }
        })
    }, [])

    const connect = useCallback(() => {
        if (!config || connectionState.isConnecting || connectionState.isConnected || connectionPending.current) {
            return
        }

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
            } catch (e) {
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
            // Each browser tab gets its own stable ID via sessionStorage.
            // This prevents session takeover when multiple tabs are open (same clientId + clean:false
            // causes EMQX to kick the old connection, triggering "Connection closed" errors).
            // sessionStorage is per-tab, so reloads within the same tab reuse the ID (maintaining session persistence),
            // but different tabs get different IDs.
            const deviceId = getCookie("deviceID")?.slice(0, 8) || "dev"
            const userSlice = userUuid?.slice(0, 8) || 'shared'
            let tabId = ''
            if (typeof window !== 'undefined') {
                tabId = sessionStorage.getItem('mqtt_tab_id') || ''
                if (!tabId) {
                    tabId = Math.random().toString(36).slice(2, 6)
                    sessionStorage.setItem('mqtt_tab_id', tabId)
                }
            }
            const stableClientId = `c_${deviceId}_${userSlice}_${tabId}`
            uniqueClientIdRef.current = stableClientId

            // SETTLE DELAY: Give the broker/OS a moment to finalize any previous 'end(true)'
            if (settleDelayRef.current) clearTimeout(settleDelayRef.current)
            settleDelayRef.current = setTimeout(() => {
                settleDelayRef.current = null
                if (isUnmounted.current) {
                    connectionPending.current = false
                    return
                }

                try {
                    const client = mqtt.connect({
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

                    // ATTACH ERROR LISTENER IMMEDIATELY to prevent "Uncaught" bubbles
                    client.on("error", (err: any) => {
                        console.error("[MQTT] Client error:", err.message)
                        if (err.message.includes("Not authorized") || err.message.includes("Connection refused")) {
                            isManualDisconnect.current = true
                        }
                        handleError(err)
                    })

                    client.on("connect", (connack: any) => {
                        handleConnect()
                        const configTopics = config.topics || []
                        const dynamicTopics = dynamicTopicManager?.getTopicsToSubscribe() || []
                        const allTopics = [...configTopics, ...dynamicTopics]
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
        connectionState.isConnecting,
        connectionState.isConnected,
        connectionConfig,
        handleConnect,
        handleDisconnect,
        handleError,
        handleMessage,
        subscribeToTopics,
        updateConnectionState,
        dynamicTopicManager
    ])

    const disconnect = useCallback(() => {
        isManualDisconnect.current = true
        clearReconnectTimeout()

        if (clientRef.current) {
            clientRef.current.end(true)
            clientRef.current = null
        }

        updateConnectionState({
            isConnected: false,
            isConnecting: false,
            reconnectAttempts: 0,
        })
    }, [clearReconnectTimeout, updateConnectionState])

    const publish = useCallback(
        (topic: string, message: string, options: mqtt.IClientPublishOptions = { qos: 0 }) => {
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
        // Initial connect only. Reconnects are handled by handleDisconnect & handleConnect
        if (config && !connectionState.isConnected && !connectionState.isConnecting && connectionState.reconnectAttempts === 0 && !isManualDisconnect.current) {
            connect()
        }
    }, [config, connectionState.isConnected, connectionState.isConnecting, connectionState.reconnectAttempts, connect])

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                // console.log("[MQTT] Tab became visible, checking connection...")
                if (!latestConnectionStateRef.current.isConnected) {
                    // console.log("[MQTT] Tab became visible, forcing reconnection...")
                    // Reset attempts to allow a fresh cycle of reconnections if we previously gave up
                    updateConnectionState({ reconnectAttempts: 0, isConnecting: true })
                    connect()
                }
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange)
        window.addEventListener("focus", handleVisibilityChange)

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange)
            window.removeEventListener("focus", handleVisibilityChange)
        }
    }, [connect, updateConnectionState])

    useEffect(() => {
        isUnmounted.current = false
        return () => {
            isUnmounted.current = true
            connectionPending.current = false
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
    }, [clearReconnectTimeout])

    return {
        connectionState,
        connect,
        disconnect,
        publish,
        client: clientRef.current,
        subscribeToTopic,
        unsubscribeFromTopic,
    }
}
