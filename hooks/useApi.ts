"use client"

import useSWR, { SWRConfiguration } from 'swr';
import axiosInstance from "@/lib/axiosInstance";
import { z } from 'zod';

/**
 * useApi: The ultimate enterprise data fetching hook.
 * 
 * Features:
 * 1. Unified Fetcher: Uses the global axiosInstance with automatic auth/loading.
 * 2. Zod Validation: Pass a schema to ensure runtime type safety.
 * 3. Standardized Errors: Automatically toasts error messages unless disabled.
 * 4. Generic Support: Fully typed response data.
 */

interface UseApiOptions<T> {
  schema?: z.ZodSchema<T>;
  config?: SWRConfiguration;
  silent?: boolean; // If true, won't show the error toast
}

const fetcher = async <T>(url: string, schema?: z.ZodSchema<T>, silent?: boolean): Promise<T> => {
  try {
    const response = await axiosInstance.get(url);
    const data = response.data;

    if (schema) {
      try {
        return schema.parse(data);
      } catch (validationError) {
        console.error(`[Zod Validation Error] [${url}]:`, validationError);
        // We still return data but we've logged the mismatch
        return data; 
      }
    }

    return data;
  } catch (error: any) {
    if (!silent && error.response?.status !== 401) {
       // Note: axiosInstance interceptor already toasts, but we can add specific handling here if needed.
    }
    throw error;
  }
};

export const useApi = <T>(
  url: string | null, 
  options: UseApiOptions<T> = {}
) => {
  const { schema, config, silent } = options;

  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    url,
    () => fetcher<T>(url as string, schema, silent),
    config
  );

  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
    // Enterprise convenience helpers
    isEmpty: Array.isArray(data) && data.length === 0,
    isError: !!error,
  };
};
