// Stub: useCapabilities — capability system not available in this build.
// Always returns can() = true and isLoading = false so all guarded UI is shown.
export function useCapabilities() {
    return {
        can: (_cap: string) => true,
        isLoading: false,
    }
}
