import { expect, it } from "vitest"
import { placeIn } from "@/lib/testing/sourceFiles"
import { loadThenThrow } from "@/testdata/lazyCode/throwsAfterLoad"

// V-138: trackImports.test.ts's stack check, in a jsdom file. Vite compiles a jsdom test's modules for the browser first
// (vite-node's web mode), where its import analysis writes more over them (a variable's import through
// __vite__injectQuery, imports put in front); the plugin hands that step its source map there too.

it("keeps a thrown error's stack at the line and column of its source, compiled for the browser", async () => {
  const thrown = await loadThenThrow().then(
    () => null,
    (error: Error) => error,
  )
  expect(thrown?.stack).toContain(placeIn("testdata/lazyCode/throwsAfterLoad.ts", "new Error"))
})
