# slam_frontend

> **Build AI — VIO Pipeline Dashboard**
> Next.js 14 + TypeScript frontend for the Build AI scene perception pipeline.

## Stack
- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS**
- **Recharts** — pose timeline charts
- **WebSocket** — live run status streaming

## Pages
| Route | Description |
|-------|-------------|
| `/` | Run list — all pipeline runs with status badges |
| `/runs/[id]` | Run detail — pose timeline + annotated video |
| `/runs/[id]/live` | Live view — WebSocket pose stream during processing |

## Getting Started

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Environment Variables

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000   # FastAPI backend URL
```

## Backend

Backend lives at [slam_backend](https://github.com/krnkiran22/slam_backend).
