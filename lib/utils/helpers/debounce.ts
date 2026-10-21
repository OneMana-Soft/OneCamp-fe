/**
 * fn, called once its calls have rested for delay ms. A component keeping one
 * cancels it when it unmounts (`useEffect(() => d.cancel, [d])`), or a call
 * waiting runs on a component that has gone (lib/utils/helpers/debounce.test.ts).
 */
export function debounceUtil<T extends (...args: never[]) => void>(fn: T, delay: number) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const debounced = (...args: Parameters<T>) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => fn(...args), delay)
    }
    /** Drops a call that is waiting. */
    debounced.cancel = () => {
        clearTimeout(timeoutId)
        timeoutId = undefined
    }
    return debounced
}
