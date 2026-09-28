import {VListHandle} from "virtua";

export interface FlatItem<T> {
    type: "separator" | "item";
    date?: string;
    data?: T;
    key: string;
}

export interface VirtualizedListProps<T> {
    items: FlatItem<T>[];
    renderItem: (item: T, index: number, total: number, recomputeItemSize?: () => void) => React.ReactNode
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