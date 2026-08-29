#!/usr/bin/env node
/**
 * pnpm configure — point this frontend at your OneCamp server.
 *
 * WHY THIS EXISTS. The committed .env.production holds placeholders, so a fresh
 * clone builds against a domain that does not resolve. That is the safe default,
 * but it leaves every buyer doing the same seven-line edit by hand, and the two
 * ways to get it wrong (a missed line, a trailing slash on the wrong variable)
 * both fail late and unhelpfully. One question is a better interface than a
 * file full of instructions.
 *
 * WHY IT WRITES .env.production.local RATHER THAN EDITING .env.production.
 * Next.js loads .env.production.local after .env.production, so the local file
 * wins. It is git-ignored, so your real domains cannot end up in a commit, and
 * `git pull` never conflicts on it. The committed file stays a readable
 * reference for what each variable means.
 *
 * Anything exported in the real environment beats both files. That is the path
 * for a Docker or CI build: pass the variables, run neither this nor an editor.
 *
 * Usage:
 *   pnpm configure                       # asks for your domain
 *   pnpm configure --domain acme.com     # non-interactive, for scripted installs
 *   pnpm configure --domain acme.com --force   # overwrite an existing local file
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";
import { writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(ROOT, ".env.production.local");

/**
 * Subdomain each service is expected at. These match the hostnames the backend's
 * docker-compose asks Traefik to issue certificates for, so a stock install works
 * with no further edits. Change the left-hand side only if you also changed the
 * backend's.
 */
const SERVICES = {
    backend: "onecamp-backend",
    frontend: "onecamp",
    livekit: "onecamp-livekit",
    collab: "onecamp-collab",
    mqtt: "onecamp-emqx",
};

/**
 * Accepts what people actually type: "acme.com", "https://acme.com/",
 * "www.acme.com". Returns the bare registrable domain, or null if it could not
 * be one. Rejecting early is the point; a typo here produces a build that looks
 * fine and cannot reach anything.
 */
export function normaliseDomain(raw) {
    let d = String(raw ?? "").trim().toLowerCase();
    if (!d) return null;
    d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
    d = d.replace(/\/.*$/, ""); // path
    d = d.replace(/:\d+$/, ""); // port
    d = d.replace(/^www\./, "");
    d = d.replace(/\.$/, ""); // trailing dot on a fully-qualified name
    // At least one dot, labels of letters/digits/hyphens not starting or ending
    // with a hyphen. Deliberately not a full RFC check: this is here to catch a
    // fumbled paste, not to validate hostile input.
    if (!/^(?!-)[a-z0-9-]+(?<!-)(\.(?!-)[a-z0-9-]+(?<!-))+$/.test(d)) return null;
    return d;
}

/** Renders the whole file from one domain, so there is a single source of truth. */
export function renderEnv(domain) {
    const host = (service) => `${SERVICES[service]}.${domain}`;
    return `# Written by \`pnpm configure\` for ${domain}.
#
# Loaded after .env.production and overrides it. Git-ignored, so your domains stay
# yours. Re-run \`pnpm configure --force\` to regenerate, or edit it by hand.
#
# Push notifications stay off until you add a Firebase project. See the comments
# in .env.production for which six values to copy and where they come from.

NEXT_PUBLIC_BACKEND_URL=https://${host("backend")}/
NEXT_PUBLIC_FRONTEND_URL=https://${host("frontend")}/
NEXT_PUBLIC_APP_URL=https://${host("frontend")}/
NEXT_PUBLIC_LIVEKIT_URL=https://${host("livekit")}
NEXT_PUBLIC_COLLABORATION_URL=wss://${host("collab")}
NEXT_PUBLIC_MQTT_HOST=${host("mqtt")}
`;
}

function flag(name) {
    const i = argv.indexOf(`--${name}`);
    if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    return inline ? inline.slice(name.length + 3) : undefined;
}

async function main() {
    const force = argv.includes("--force");
    const given = flag("domain");

    // Validate a supplied --domain BEFORE anything else, so a typo is reported as
    // a typo. Checked ahead of the file test because otherwise a bad domain on a
    // machine that is already configured comes back as "file exists", which sends
    // the reader to fix the wrong thing.
    if (given !== undefined && normaliseDomain(given) === null) {
        console.error(`Not a domain: ${given}`);
        exit(1);
    }

    if (existsSync(TARGET) && !force) {
        console.error(
            `.env.production.local already exists.\n` +
            `Re-run with --force to overwrite it, or edit it directly.`,
        );
        exit(1);
    }

    let domain = normaliseDomain(given);

    if (!domain) {
        // Nothing was supplied, so ask. A scripted install has nobody to answer,
        // and is told what to pass instead.
        if (!stdin.isTTY) {
            console.error("No terminal to ask on. Pass --domain your-domain.com");
            exit(1);
        }
        const rl = createInterface({ input: stdin, output: stdout });
        try {
            for (let attempt = 0; attempt < 3 && !domain; attempt++) {
                const answer = await rl.question(
                    "\nWhich domain does your OneCamp server run on? (e.g. acme.com)\n> ",
                );
                domain = normaliseDomain(answer);
                if (!domain) console.log("That does not look like a domain. Try again.");
            }
        } finally {
            rl.close();
        }
        if (!domain) exit(1);
    }

    writeFileSync(TARGET, renderEnv(domain), "utf8");

    console.log(`\nWrote .env.production.local for ${domain}:\n`);
    for (const [, sub] of Object.entries(SERVICES)) console.log(`    ${sub}.${domain}`);
    console.log(
        `\nPoint those DNS records at your server, then:\n\n` +
        `    pnpm build && pnpm start\n\n` +
        `Push notifications are off until you add a Firebase project;\n` +
        `.env.production says which values and where to find them.\n`,
    );
}

// Importable for tests without running the prompt.
if (import.meta.url === `file://${argv[1]}`) {
    main().catch((e) => {
        console.error(e?.message ?? e);
        exit(1);
    });
}
