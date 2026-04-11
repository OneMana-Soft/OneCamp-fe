<div align="center">

<img src="https://raw.githubusercontent.com/OneMana-Soft/OneCamp-fe/main/public/logo.svg" alt="OneCamp Logo" width="80" height="80" />
# OneCamp

### The Self-Hosted Unified Workspace

**Chat · Tasks · Docs · Video — all on your own server.**

[![TypeScript](https://img.shields.io/badge/TypeScript-97%25-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/OneMana-Soft/OneCamp-fe?style=flat-square&color=yellow)](https://github.com/OneMana-Soft/OneCamp-fe/stargazers)

[**Live Demo**](https://youtu.be/6hjfFFAmCBs) · [**Get the Backend**](https://onemana.dev/onecamp-product) · [**Report a Bug**](https://github.com/OneMana-Soft/OneCamp-fe/issues)

</div>

---

## What is OneCamp?

OneCamp is an open-source, self-hosted workspace that replaces Slack + Notion + Zoom — without per-seat pricing or vendor lock-in. Deploy it on your own infrastructure and own your data completely.

| Feature | Description |
|---|---|
| 💬 **Real-time Chat** | Channels, DMs, threads, reactions, file sharing |
| ✅ **Tasks & Kanban** | Visual boards, assignees, due dates, project tracking |
| 📝 **Collaborative Docs** | Rich-text editor with real-time multiplayer co-editing |
| 🎥 **Video Meetings** | HD calls, screen sharing, and recordings via LiveKit |
| 🏢 **Teams & Projects** | Fine-grained permissions and organized workspaces |
| 📱 **PWA Support** | Works on any device with push notifications |

---

## Tech Stack

This repository is the **Next.js frontend**. The Go backend is available separately (see below).

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) + [React 19](https://react.dev/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) |
| Real-time A/V | [LiveKit](https://livekit.io/) |
| Collaboration | [Tiptap](https://tiptap.dev/) + [Hocuspocus](https://tiptap.dev/hocuspocus) + [Yjs](https://yjs.dev/) |
| State Management | [Redux Toolkit](https://redux-toolkit.js.org/) |
| Animations | [Framer Motion](https://www.framer.com/motion/) |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- Node.js **v20+**
- `pnpm` (recommended)

### 1. Clone

```bash
git clone https://github.com/OneMana-Soft/OneCamp-fe.git
cd OneCamp-fe
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment


Create a `.env.production` file in the project root:

```env
NEXT_PUBLIC_BACKEND_URL=https://onecamp-backend.your-domain.com/
NEXT_PUBLIC_FRONTEND_URL=https://onecamp.your-domain.com/
NEXT_PUBLIC_APP_URL=https://onecamp.your-domain.com/
NEXT_PUBLIC_ORG_NAME=one camp
NEXT_PUBLIC_LIVEKIT_URL=https://onecamp-livekit.your-domain.com
NEXT_PUBLIC_COLLABORATION_URL=wss://onecamp-collab.your-domain.com
NEXT_PUBLIC_MQTT_HOST=onecamp-emqx.your-domain.com

# Firebase (optional — for push notifications)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 4. Run/deploy on vercel

## Backend

This frontend requires the **OneCamp Go backend** to function. The backend is a production-grade, microservices architecture including:

- ⚙️ Highly scalable Go microservices
- 🔄 Real-time signaling and state synchronization
- 🗄️ Pre-configured Postgres, Redis, and MinIO
- 🐳 Complete Docker Compose setup for one-command deployment

**→ [Get the backend license for $19 at onemana.dev](https://onemana.dev/onecamp-product)**

---

## Project Structure

```
OneCamp-fe/
├── app/              # Next.js App Router pages & layouts
├── components/       # Reusable UI components
├── context/          # React context providers
├── hooks/            # Custom React hooks
├── lib/              # Utility functions
├── services/         # API service layer
├── store/            # Redux store & slices
├── tools/            # Developer tooling/scripts
└── types/            # TypeScript type definitions
```

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push and open a Pull Request

---

## Support

- 🐛 **Bugs & feature requests** → [GitHub Issues](https://github.com/OneMana-Soft/OneCamp-fe/issues)
- 💬 **General questions** → open a Discussion
- 🌐 **Product info** → [onemana.dev](https://onemana.dev/onecamp-product)

---

<div align="center">

Made with ❤️ by [OneMana Soft](https://onemana.dev)

</div>
