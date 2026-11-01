// A load, then an error on the same line (V-138: lib/testing/trackImports.test.ts). The transform writes text in front
// of the import(), so only its source map keeps the error's stack at this line and column.
export const loadThenThrow = () => import("./target").then(() => Promise.reject(new Error("thrown after the load")))
