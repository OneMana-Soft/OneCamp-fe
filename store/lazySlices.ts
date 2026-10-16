/**
 * The slices a page adds when it first needs them (injectSlice, store.ts), by
 * the name their state lives at. Only some pages use them (a doc's comments
 * and threads), so the store's static list leaves them out: a page that never
 * uses them holds none of their state, nor reaches their code through the
 * store (app/firstLoad.test.ts holds a project's first screen to a ceiling).
 *
 * A slice's own module adds its entry, so RootState knows its state:
 *
 *   declare module "@/store/lazySlices" {
 *       interface LazySlices {
 *           threads: ThreadsState
 *       }
 *   }
 *
 * and whatever first uses it adds it, from a module only that page loads (a
 * lazy slot contribution, a page's own view), at the module's top:
 *
 *   injectSlice(threadsSlice)
 *
 * RootState carries each as optional: until that page has loaded, it isn't
 * there, so a reader outside it reads `state.threads?.…`.
 *
 * This file holds only the type, so naming it costs a page nothing.
 */
// The entries come from the slices' own modules (declaration merging).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LazySlices {}
