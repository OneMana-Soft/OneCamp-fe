import { useFetch } from "@/hooks/useFetch";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { ChatLoadingSkeleton } from "@/components/chat/ChatLoadingSkeleton";

interface PaginationResponse<T> {
    data: {
        has_more: boolean;
        chats?: T[];
        posts?: T[];
    };
}

interface UseMessagePaginationProps<T> {
    chatId: string;
    messageId?: string;
    endpoints: {
        latest: string;
        newWithCurrent: string;
        oldBefore: string;
        newAfter: string;
    };
    state: {
        messages: T[];
    };
    actions: {
        updateMessages: (items: T[]) => void;
        updateScroll: (scrollToBottom: boolean) => void;
    };
    getData: (data: any) => T[];
    getTime: (item: T) => string;
    getId: (item: T) => string;
}

export const useMessagePagination = <T>({
    chatId,
    messageId,
    endpoints,
    state,
    actions,
    getData,
    getTime,
    getId
}: UseMessagePaginationProps<T>) => {
    
    const latestMsg = useFetch<PaginationResponse<T>>(messageId ? '' : endpoints.latest);
    const getNewChatsWithCurrentChat = useFetch<PaginationResponse<T>>(messageId ? endpoints.newWithCurrent : '');

    const [hasMoreOld, setHasMoreOld] = useState(true);
    const [oldTime, setOldTime] = useState(0);
    const oldMsg = useFetch<PaginationResponse<T>>(oldTime == 0 ? '' : endpoints.oldBefore + '/' + oldTime);

    const [hasMoreNew, setHasMoreNew] = useState(!!messageId);
    const [newTime, setNewTime] = useState(0);
    const newMsg = useFetch<PaginationResponse<T>>(newTime == 0 ? '' : endpoints.newAfter + '/' + newTime);

    useEffect(() => {
        if (messageId && getNewChatsWithCurrentChat.data?.data) {
            const newItems = getData(getNewChatsWithCurrentChat.data.data) ?? [];
            actions.updateMessages(newItems);
        }

        if (!messageId && latestMsg.data?.data && state.messages.length == 0) {
            const data = getData(latestMsg.data.data);
            if (data) {
                // Avoid mutating SWR cache
                const newItems = [...data].reverse();
                actions.updateMessages(newItems);
                setHasMoreNew(false);
            }
        }
        // state.messages is intentionally a dependency: if the store is
        // cleared/empties out from under us (e.g. a sync event), this
        // effect must re-run and refill from `latestMsg` instead of
        // leaving the pane permanently empty.
    }, [getNewChatsWithCurrentChat, latestMsg, state.messages, messageId]);

    useEffect(() => {
        if (state.messages && oldMsg.data?.data && oldTime != 0) {
            setHasMoreOld(oldMsg.data.data.has_more);
            setOldTime(0);
            const data = getData(oldMsg.data.data);
            if (data && data.length !== 0) {
                const items = [...data].reverse().concat(state.messages);
                actions.updateMessages(items);
            }
        }
    }, [oldMsg.data?.data, state.messages]);

    useEffect(() => {
        if (state.messages && newMsg.data?.data && newTime != 0) {
            setHasMoreNew(newMsg.data.data.has_more);
            setNewTime(0);
            const data = getData(newMsg.data.data);
            if (data && data.length !== 0) {
                const items = state.messages.concat(data);
                actions.updateMessages(items);
            }
        }
    }, [newMsg.data?.data, state.messages]);

    const handleClickedScrollToBottom = () => {
        const data = latestMsg.data?.data ? getData(latestMsg.data.data) : null;
        
        if (state.messages.length > 0 && data && data.length > 0 && getId(state.messages[state.messages.length - 1]) != getId(data[0])) {
            const newItems = [...data].reverse();
            actions.updateMessages(newItems);
        }

        actions.updateScroll(true);
    };

    const getOldMessages = () => {
        if (state.messages.length === 0) return;
        const lastTimeString = getTime(state.messages[0]);
        const epochTime = Math.floor(Date.parse(lastTimeString) / 1000);
        setOldTime(epochTime);
        setHasMoreOld(false);
    };

    const getNewMessages = () => {
        if (state.messages.length === 0) return;
        const lastTimeString = getTime(state.messages[state.messages.length - 1]);
        const epochTime = Math.ceil(Date.parse(lastTimeString) / 1000);
        setNewTime(epochTime);
        setHasMoreNew(false);
    };

    const isLoading = latestMsg.isLoading && state.messages.length === 0;

    return {
        hasMoreNew,
        hasMoreOld,
        isNewLoading: newMsg.isLoading,
        isOldLoading: oldMsg.isLoading,
        isLoading,
        getNewMessages,
        getOldMessages,
        handleClickedScrollToBottom
    };
};
