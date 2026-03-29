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
            // In a real enterprise app, we might report this to Sentry
            return data; // Fallback to raw data in dev/soft-launch
        }
    }

    return data;
};

export const useFetch = <T>(url: string, schema?: z.ZodSchema<T>, config?: SWRConfiguration) => {
    const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
        url == '' ? null : url, 
        () => fetcher<T>(url, schema),
        config
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
        isLoading: isLoading || isValidating,
        isError: error,
        mutate
    }), [data, isLoading, isValidating, error, mutate]);
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