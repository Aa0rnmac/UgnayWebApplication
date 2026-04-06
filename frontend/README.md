# FSL Learning Hub Frontend

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS

## Environment
1. Copy `.env.local.example` to `.env.local`.
2. Ensure:
   - `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api`

## Run
```bash
npm install
npm run dev
```

## Pages
- `/` dashboard/home with progress summary
- `/modules` module sidebar + lesson content + assessment controls + locking
- `/lab` free signing lab camera UI + mock prediction
