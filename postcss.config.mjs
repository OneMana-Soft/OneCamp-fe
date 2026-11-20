import groupSelectors from "./lib/css/groupSelectors.mjs";

// Next's Turbopack PostCSS loader requires string entries and uses plugin objects as they
// are. Order matters: groupSelectors rewrites the group-*/peer-* selectors Tailwind writes.
const config = {
    plugins: ["@tailwindcss/postcss", groupSelectors()],
};

export default config;
