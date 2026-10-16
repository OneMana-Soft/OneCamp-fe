"use client"

/**
 * The comments' two pieces in a doc's editor (B7), in one chunk: the overlay
 * (Comment, the threads on their words, a reader's Comment button) and the
 * margin's markers. Every doc draws both, and they share the threads, their
 * store and the list's rules: loaded apart, each chunk carried its own copy
 * of all of that (about 5 KB gzipped twice on the doc route).
 */
export { default as CommentsOverlay } from "./CommentsOverlay"
export { default as ThreadGutter } from "@/components/docEditor/ThreadGutter"
