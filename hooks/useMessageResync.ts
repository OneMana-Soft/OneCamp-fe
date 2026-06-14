// Stub: useMessageResync — no-op in this build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useMessageResync<T = unknown>(_opts?: {
    enabled?: boolean
    latestUrl?: string
    fetchFn?: () => Promise<T>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extract?: (payload: any) => T[] | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onMerge?: (items: any) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDelete?: (items: any) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
}) {
    // No-op in public build
}
