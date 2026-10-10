import {VListHandle} from "virtua";

export interface FlatItem<T> {
    /** A day's heading, a message, or where the unread messages start. */
    type: "separator" | "item" | "unread";
    date?: string;
    data?: T;
    key: string;
    /** Continues the message above it (lib/messageGrouping): drawn without avatar and name. */
    continued?: boolean;
}

/**
 * What a row is told about its place in the conversation. Never its index: an
 * index changes for every row when older messages load above or a message
 * arrives below, and rows that re-rendered for that redrew the whole
 * conversation on every new message.
 */
export interface RowMeta {
    /** Among the newest few rows: its images load first. */
    priority: boolean;
    /** The newest row: read receipts sit under it. */
    isLast: boolean;
    /** Continues the message above it (lib/messageGrouping). */
    continued: boolean;
}

export interface VirtualizedListProps<T> {
    items: FlatItem<T>[];
    renderItem: (item: T, meta: RowMeta) => React.ReactNode
    getDateHeading: (date: string) => string;
    containerClassName?: string;
    fetchOlderMessage: () => void;
    olderMessageLoading?: boolean
    hasOldMessage?: boolean
    fetchNewMessage: () => void;
    newMessageLoading?: boolean;
    hasNewMessage?: boolean;
    clickedScrollToBottom: () => void;
    ref: React.RefObject<VListHandle | null>
}
