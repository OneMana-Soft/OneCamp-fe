// The three ways an import() names its module (V-138: lib/testing/trackImports.test.ts). App code as far as
// vitest.config.ts knows, so each is handed to the tests' registry.

export const byString = () => import("./target")

export const byTemplate = (name: string) => import(`./${name}.ts`)

export const byVariable = (path: string) => import(/* @vite-ignore */ path)
