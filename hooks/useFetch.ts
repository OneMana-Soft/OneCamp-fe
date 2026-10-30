import useSWR, { SWRConfiguration, useSWRConfig } from 'swr';
import axiosInstance from "@/lib/axiosInstance";
import type { AxiosRequestConfig } from "axios";
import { useMemo, useRef, useState } from 'react';
import { tellReadFailure } from "@/lib/http/loadFailure";
import { freshlySeeded } from "@/lib/swrSeed";
import { noteAnswered } from "@/lib/http/answered";

/**
 * Who says that a read failed (lib/http/loadFailure). The hook decides, not
 * the request interceptor: its reads go out quiet, and a failure raises a
 * toast only when
 *   - the caller doesn't say it itself (a screen that draws its own error
 *     state passes OWN_ERRORS, and says it in place);
 *   - nothing is on screen for the key yet: a refresh that fails under what
 *     is shown says nothing ("Something went wrong · internal error" over a
 *     channel whose messages were all there);
 *   - it is the first failure since the key last loaded: SWR's retries of a
 *     read already told stay quiet.
 * Even then the toast waits a beat, and an error state on screen keeps it
 * quiet.
 */
function useReadFailure(url: string, requestConfig?: AxiosRequestConfig) {
    const onScreen = useRef(false);
    const told = useRef<string | null>(null);
    const owns = !!requestConfig?.suppressErrorToast;
    const run = async <R,>(read: (config: AxiosRequestConfig) => Promise<R>): Promise<R> => {
        try {
            const result = await read({ ...requestConfig, suppressErrorToast: true });
            told.current = null;
            return result;
        } catch (error) {
            if (!owns && !onScreen.current && told.current !== url) {
                told.current = url;
                tellReadFailure(error);
            }
            throw error;
        }
    };
    return { onScreen, run };
}

/**
 * A response's checker: anything whose parse returns the data or throws. A
 * Zod schema is one, so callers that validate keep passing theirs; the hook
 * itself doesn't bring Zod onto the first screen (fluid-15).
 */
export interface ResponseShape<T> {
    parse(data: unknown): T
}

const fetcher = async <T>(url: string, schema?: ResponseShape<T>, requestConfig?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.get(url, requestConfig);
    let data = response.data;

    if (schema) {
        try {
            data = schema.parse(data);
        } catch (error) {
            console.error(`[Validation Error] [${url}]:`, error);
            throw error;
        }
    }

    // Once SWR has stored it.
    setTimeout(() => noteAnswered(url), 0);
    return data;
};

/** SWR's options, and onFetched: each answer before SWR keeps it (the panel seeds its parts' keys). */
export type FetchConfig<T> = SWRConfiguration & { onFetched?: (data: T) => void };

export const useFetch = <T>(url: string, schema?: ResponseShape<T>, fetchConfig?: FetchConfig<T>, requestConfig?: AxiosRequestConfig) => {
    const { onFetched, ...config } = fetchConfig ?? {};
    const onFetchedRef = useRef(onFetched);
    onFetchedRef.current = onFetched;
    const requestSequenceRef = useRef(0);
    const [lastRequestStartedAt, setLastRequestStartedAt] = useState<number>();
    const failure = useReadFailure(url, requestConfig);
    const { cache } = useSWRConfig();
    const { data, error, isLoading, mutate } = useSWR<T>(
        url == '' ? null : url,
        async () => {
            const sequence = ++requestSequenceRef.current;
            const requestStartedAt = Date.now();
            const result = await failure.run((quiet) => fetcher<T>(url, schema, quiet));
            onFetchedRef.current?.(result);
            // Only pair Redux authority with the newest completed request.
            // A slower superseded response must not advance the watermark.
            if (sequence === requestSequenceRef.current) {
                setLastRequestStartedAt(requestStartedAt);
            }
            return result;
        },
        {
            // MQTT keeps what's on screen live, so a tab's focus refetches at
            // most once a minute (every key on screen at once was a herd
            // against the API), and nothing polls while the tab is hidden or
            // offline: a forgotten tab hit the API all day.
            focusThrottleInterval: 60_000,
            refreshWhenHidden: false,
            refreshWhenOffline: false,
            ...(url && freshlySeeded(url) ? { revalidateOnMount: false } : {}),
            ...config,
        }
    );

    failure.onScreen.current = data !== undefined;
    // With keepPreviousData, SWR hands back the last key's answer while this
    // key has none, and keeps handing it back if this key's read fails. A
    // reader that draws its failure only when there's no data then shows the
    // last key's answer as this one's: isPrevious says the data is another key's.
    const isPrevious = !!config?.keepPreviousData && data !== undefined && cache.get(url)?.data === undefined;

    return useMemo(() => ({
        data,
        isLoading: isLoading,
        isError: error,
        isPrevious,
        mutate,
        lastRequestStartedAt,
    }), [data, isLoading, error, isPrevious, mutate, lastRequestStartedAt]);
};


export const useFetchOnlyOnce = <T>(url: string, schema?: ResponseShape<T>, config?: SWRConfiguration, requestConfig?: AxiosRequestConfig) => {
    const failure = useReadFailure(url, requestConfig);
    const swr = useSWR<T>(
        url == '' ? null : url, 
        () => failure.run((quiet) => fetcher<T>(url, schema, quiet)), 
        {
            revalidateOnFocus: false, // Disable refetch on window focus
            revalidateOnReconnect: false, // Disable refetch on reconnect
            revalidateIfStale: false,
            ...config,
        }
    );
    // SWR draws a reader again when a field it READ changes. isValidating is
    // read only when a caller asks for it (the getter below): read here for
    // all of them, every request for the key, even one that changed nothing,
    // drew each reader twice. The profile has 94 readers, and the palette's
    // first open drew 2,251 components for its one request (useFetchReaders.test).
    const latest = useRef(swr);
    latest.current = swr;
    const { data, error, isLoading, mutate } = swr;

    failure.onScreen.current = data !== undefined;

    return useMemo(() => ({
        data,
        isLoading: isLoading,
        /** Whether a request for the key is out. Reading it draws this reader again as each one goes and comes back. */
        get isValidating() {
            return latest.current.isValidating;
        },
        isError: error,
        mutate
    }), [data, isLoading, error, mutate]);
};

const mediaFetcher = async <T>(url: string, requestConfig: AxiosRequestConfig): Promise<T> => {
    const f = axiosInstance.get(url, requestConfig).then((response) => response.data);

    return f;
};

export const useMediaFetch = <T>(url: string, fallbackData?: T) => {
    const failure = useReadFailure(url);
    const { data, error, isLoading, isValidating, mutate } = useSWR<T>(url == '' ? null : url, (key: string) => failure.run((quiet) => mediaFetcher<T>(key, quiet)), {
        refreshInterval: 4 * 60 * 1000, // 4 minutes (before 5 min expiry)
        dedupingInterval: 60000, // 1 minute
        fallbackData
    });

    failure.onScreen.current = data !== undefined;

    return useMemo(() => ({
        data,
        isLoading: isLoading,
        isError: error,
        isValidating,
        mutate
    }), [data, isLoading, error, isValidating, mutate]);
};