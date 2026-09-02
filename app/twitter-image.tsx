// X renders the same card. The image itself is re-exported rather than
// duplicated so the two can never drift into saying different things about the
// same product.
//
// `runtime` is declared here rather than re-exported: Next reads that field
// statically per route and cannot follow it through a re-export, so forwarding
// it silently falls back to the default runtime.
export const runtime = "edge";
export { default, alt, size, contentType } from "./opengraph-image";
