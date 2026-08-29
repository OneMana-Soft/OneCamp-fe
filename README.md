<div align="center">

<img src="https://raw.githubusercontent.com/OneMana-Soft/OneCamp-fe/main/public/logo.svg" alt="OneCamp Logo" width="80" height="80" />

# OneCamp

### The Self-Hosted Unified Workspace

**Chat · Tasks · Docs · Whiteboards · Video — all on your own server.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/OneMana-Soft/OneCamp-fe?style=flat-square&color=yellow)](https://github.com/OneMana-Soft/OneCamp-fe/stargazers)

[**Live Demo**](https://onecamp.onemana.dev) · [**Get the Backend**](https://onemana.dev/buy) · [**Docs**](https://onemana.dev/docs) · [**Report a Bug**](https://github.com/OneMana-Soft/OneCamp-fe/issues)

</div>

---

## What is OneCamp?

OneCamp is an open-source, self-hosted workspace that replaces Slack + Notion + Zoom, without per-seat pricing and without your conversations living on somebody else's machine. You run it on your own infrastructure, and the data stays there.

| | |
|---|---|
| 💬 **Real-time chat** | Channels, DMs, threads, reactions, file sharing |
| ✅ **Tasks & boards** | Kanban, assignees, due dates, project tracking |
| 📝 **Collaborative docs** | Rich-text editing with real-time multiplayer cursors |
| 📊 **Tables** | Structured records with views, filters and formulas |
| 🎨 **Whiteboards** | Freeform drawing and diagramming alongside the docs |
| 🎥 **Video meetings** | HD calls, screen sharing, recording, live captions |
| 📅 **Calendar** | Scheduling that knows about the meetings in your channels |
| 🏢 **Teams & projects** | Fine-grained permissions and organised workspaces |
| 🔐 **Enterprise sign-in** | SAML, OIDC, LDAP, SCIM provisioning, MFA |
| 📱 **Installable app** | PWA with push notifications on desktop and mobile |

Unlimited users. One payment. Your server.

---

## Tech Stack

This repository is the **Next.js frontend**. The Go backend is a separate download (see below).

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) |
| Real-time A/V | [LiveKit](https://livekit.io/) |
| Collaboration | [Tiptap](https://tiptap.dev/) + [Hocuspocus](https://tiptap.dev/hocuspocus) + [Yjs](https://yjs.dev/) |
| Whiteboards | [Excalidraw](https://excalidraw.com/) |
| Messaging | MQTT over [EMQX](https://www.emqx.io/) |
| State | [Redux Toolkit](https://redux-toolkit.js.org/) |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- Node.js **v20.9+**
- `pnpm` (recommended)
- A running OneCamp backend. The frontend is a client; on its own it has nothing to talk to.

### 1. Clone and install

```bash
git clone https://github.com/OneMana-Soft/OneCamp-fe.git
cd OneCamp-fe
pnpm install
```

### 2. Point it at your server

```bash
pnpm configure
```

It asks one question, your domain, and writes `.env.production.local` with the six addresses derived from it:

```
onecamp.your-domain.com            the app
onecamp-backend.your-domain.com    the API
onecamp-livekit.your-domain.com    calls
onecamp-collab.your-domain.com     live document editing
onecamp-emqx.your-domain.com       real-time messaging
```

Those match the hostnames the backend's Docker Compose already requests certificates for, so a stock install needs no further edits. Point the DNS records at your server and you are done.

For a scripted install, skip the prompt:

```bash
pnpm configure --domain your-domain.com
```

<details>
<summary><b>Configuring it by hand instead</b></summary>

Every variable is documented in [`.env.production`](.env.production), which ships with placeholders. Three ways to supply real values, in the order Next.js prefers them:

1. **Environment variables** — highest precedence, and the right answer for a Docker or CI build.
2. **`.env.production.local`** — what `pnpm configure` writes. Git-ignored, so your domains never land in a commit and `git pull` never conflicts with your configuration.
3. **`.env.production`** — the committed reference. Editing it works, but your changes will collide the next time you pull.

Everything here is `NEXT_PUBLIC_`, which means it is compiled into the JavaScript the browser downloads. None of it is secret and none of it should be. Real secrets stay in the backend's own `.env`.

</details>

### 3. Build and run

```bash
pnpm build
pnpm start
```

Or `pnpm dev` for a development server on port 3001.

### 4. Push notifications (optional)

Off until you configure them, and they need a Firebase Cloud Messaging project of **your** own: the token a browser mints is only redeemable by the project that issued it, so a shared one cannot work. Copy the six web-app values plus the VAPID key into `.env.production.local`; [`.env.production`](.env.production) lists exactly which ones and where in the Firebase console to find them.

Everything else in OneCamp works without this.

---

## Backend

This frontend requires the **OneCamp Go backend**. It ships as a single Docker Compose deployment including:

- Go services for chat, documents, tasks, calendar and meetings
- Real-time signalling and state synchronisation
- Postgres, Dgraph, Redis, MinIO and EMQX, pre-configured
- Traefik with automatic HTTPS certificates
- Enterprise sign-in: SAML, OIDC, LDAP, SCIM, MFA
- One command to install, one command to update

**→ [Get the backend licence for $19 at onemana.dev](https://onemana.dev/buy)** — pay once, unlimited users, no per-seat pricing.

---

## Project Structure

```
OneCamp-fe/
├── app/              # Next.js App Router pages & layouts
├── components/       # UI components
├── context/          # React context providers
├── e2e/              # Playwright end-to-end tests
├── hooks/            # Custom React hooks
├── lib/              # Utilities, env validation, security headers
├── public/           # Static assets & the service worker
├── scripts/          # Setup and tooling
├── services/         # API service layer
├── store/            # Redux store & slices
└── types/            # TypeScript type definitions
```

---

## Development

```bash
pnpm dev          # dev server on :3001
pnpm lint         # ESLint
pnpm test:unit    # unit tests (Vitest)
pnpm test:e2e     # end-to-end tests (Playwright)
```

CI runs lint, a production build, the unit tests and the Playwright suite on every push and pull request.

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push and open a Pull Request

Run `pnpm lint && pnpm test:unit` before opening it; that is what CI checks first.

---

## Support

- 🐛 **Bugs & feature requests** → [GitHub Issues](https://github.com/OneMana-Soft/OneCamp-fe/issues)
- 📖 **Setup & operations** → [onemana.dev/docs](https://onemana.dev/docs)
- 🌐 **Product info & pricing** → [onemana.dev](https://onemana.dev/buy)

---

<div align="center">

Made with ❤️ by [OneMana Soft](https://onemana.dev)

</div>
