export interface mqttConfigRes {
    clientId: string
    username: string
    password: string
    topics: string[]
    /** Each channel's, DM's and group's topics in topics, by its key (lib/conversation keyOf). */
    conversation_topics?: Record<string, string[]>
    ws_url?: string
}

export interface MqttConnectionState {
    isConnected: boolean
    isConnecting: boolean
    error: string | null
    reconnectAttempts: number
}

export interface TypingTimeout {
    userId: string
    timer: NodeJS.Timeout
}

export interface ConnectionConfig {
    wsUrl: string
    wsPort: number
    reconnectInterval: number
    typingTimeout: number
}

export interface TopicSubscription {
    topic: string
    callback: (message: string, topic: string) => void
    id: string
}

export interface DynamicTopicManager {
    subscriptions: Map<string, TopicSubscription[]>
    subscribe: (topic: string, callback: (message: string, topic: string) => void) => string
    unsubscribe: (subscriptionId: string) => void
    getTopicsToSubscribe: () => string[]
}