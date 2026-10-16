import useSWR, { SWRConfiguration } from 'swr';
import axiosInstance from "@/lib/axiosInstance";
import type { AxiosRequestConfig } from "axios";
import { z } from 'zod';
import { useMemo, useRef, useState } from 'react';
import { tellReadFailure } from "@/lib/http/loadFailure";

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

const fetcher = async <T>(url: string, schema?: z.ZodSchema<T>, requestConfig?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.get(url, requestConfig);
    const data = response.data;

    if (schema) {
        try {
            return schema.parse(data);
        } catch (error) {
            console.error(`[Validation Error] [${url}]:`, error);
            throw error;
        }
    }

    return data;
};

export const useFetch = <T>(url: string, schema?: z.ZodSchema<T>, config?: SWRConfiguration, requestConfig?: AxiosRequestConfig) => {
    const requestSequenceRef = useRef(0);
    const [lastRequestStartedAt, setLastRequestStartedAt] = useState<number>();
    const failure = useReadFailure(url, requestConfig);
    const { data, error, isLoading, mutate } = useSWR<T>(
        url == '' ? null : url,
        async () => {
            const sequence = ++requestSequenceRef.current;
            const requestStartedAt = Date.now();
            const result = await failure.run((quiet) => fetcher<T>(url, schema, quiet));
            // Only pair Redux authority with the newest completed request.
            // A slower superseded response must not advance the watermark.
            if (sequence === requestSequenceRef.current) {
                setLastRequestStartedAt(requestStartedAt);
            }
            return result;
        },
        {
            // MQTT pushes real-time updates for messages, channels, tasks,
            // docs, activity, calls, and admin events. Tab-focus refetches
            // every cached SWR key on the screen, which produces a thundering
            // herd against the API on a multi-tabbed workflow. Throttle to
            // 60s so a user genuinely returning after a long break still gets
            // a refresh, but rapid focus toggles don't replay the world.
            // Consumers can still opt out per-call by passing
            // `revalidateOnFocus: false` in `config`.
            focusThrottleInterval: 60_000,
            // Pause refresh polling when the tab is hidden or offline.
            // SWR will resume on the next focus / online event so a user
            // returning to a forgotten tab still gets a fresh paint
            // within `focusThrottleInterval`. Without these, a long-
            // forgotten admin tab keeps hitting the API every Nms 24/7.
            refreshWhenHidden: false,
            refreshWhenOffline: false,
            ...config,
        }
    );

    failure.onScreen.current = data !== undefined;

    return useMemo(() => ({
        data,
        isLoading: isLoading,
        isError: error,
        mutate,
        lastRequestStartedAt,
    }), [data, isLoading, error, mutate, lastRequestStartedAt]);
};


export const useFetchOnlyOnce = <T>(url: string, schema?: z.ZodSchema<T>, config?: SWRConfiguration, requestConfig?: AxiosRequestConfig) => {
    const failure = useReadFailure(url, requestConfig);
    const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
        url == '' ? null : url, 
        () => failure.run((quiet) => fetcher<T>(url, schema, quiet)), 
        {
            revalidateOnFocus: false, // Disable refetch on window focus
            revalidateOnReconnect: false, // Disable refetch on reconnect
            revalidateIfStale: false,
            ...config,
        }
    );

    failure.onScreen.current = data !== undefined;

    return useMemo(() => ({
        data,
        isLoading: isLoading,
        isValidating,
        isError: error,
        mutate
    }), [data, isLoading, isValidating, error, mutate]);
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