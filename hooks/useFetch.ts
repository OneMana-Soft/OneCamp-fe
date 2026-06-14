import useSWR, { SWRConfiguration } from 'swr';
import axiosInstance from "@/lib/axiosInstance";
import { z } from 'zod';
import { useMemo } from 'react';

const fetcher = async <T>(url: string, schema?: z.ZodSchema<T>): Promise<T> => {
    const response = await axiosInstance.get(url);
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

export const useFetch = <T>(url: string, schema?: z.ZodSchema<T>, config?: SWRConfiguration) => {
    const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
        url == '' ? null : url, 
        () => fetcher<T>(url, schema),
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

    return useMemo(() => ({
        data,
        isLoading: isLoading,
        isError: error,
        mutate
    }), [data, isLoading, error, mutate]);
};


export const useFetchOnlyOnce = <T>(url: string, schema?: z.ZodSchema<T>) => {
    const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
        url == '' ? null : url, 
        () => fetcher<T>(url, schema), 
        {
            revalidateOnFocus: false, // Disable refetch on window focus
            revalidateOnReconnect: false, // Disable refetch on reconnect
            revalidateIfStale: false
        }
    );

    return useMemo(() => ({
        data,
        isLoading: isLoading,
        isError: error,
        mutate
    }), [data, isLoading, error, mutate]);
};

const mediaFetcher = async <T>(url: string): Promise<T> => {
    const f = axiosInstance.get(url).then((response) => response.data);

    return f;
};

export const useMediaFetch = <T>(url: string, fallbackData?: T) => {
    const { data, error, isLoading, isValidating, mutate } = useSWR<T>(url == '' ? null : url, mediaFetcher, {
        refreshInterval: 4 * 60 * 1000, // 4 minutes (before 5 min expiry)
        dedupingInterval: 60000, // 1 minute
        fallbackData
    });

    return useMemo(() => ({
        data,
        isLoading: isLoading,
        isError: error,
        isValidating,
        mutate
    }), [data, isLoading, error, isValidating, mutate]);
};