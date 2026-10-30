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

/**
 * A page's word for when its topic goes live (the broker answered the
 * subscription): what was sent before then reached neither its read nor the
 * stream, so it reads what it shows again. `since`: when the page opened; a
 * topic already live by then needs nothing read again.
 */
export interface TopicLive {
    since: number
    onLive: () => void
}

export interface TopicSubscription {
    topic: string
    callback: (message: string, topic: string) => void
    id: string
    live?: TopicLive
}

export interface DynamicTopicManager {
    subscriptions: Map<string, TopicSubscription[]>
    subscribe: (topic: string, callback: (message: string, topic: string) => void, live?: TopicLive) => string
    unsubscribe: (subscriptionId: string) => void
    getTopicsToSubscribe: () => string[]
}