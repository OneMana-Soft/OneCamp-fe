import {VListHandle} from "virtua";

export interface FlatItem<T> {
    type: "separator" | "item";
    date?: string;
    data?: T;
    key: string;
    /** Continues the message above it (lib/messageGrouping): drawn without avatar and name. */
    continued?: boolean;
}

export interface VirtualizedListProps<T> {
    items: FlatItem<T>[];
    renderItem: (item: T, index: number, total: number, continued?: boolean) => React.ReactNode
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