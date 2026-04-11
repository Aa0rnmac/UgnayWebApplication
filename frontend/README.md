# FSL Learning Hub Frontend

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS

## Environment
1. Shared defaults are loaded from tracked `frontend/.env.shared`.
2. Copy `.env.local.example` to `.env.local` for machine-specific overrides.
   - Runtime precedence is: `frontend/.env.shared` then `frontend/.env.local`.
3. Ensure:
   - `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api`
4. Optional demo credential overrides:
   - `NEXT_PUBLIC_DEMO_STUDENT_USERNAME`, `NEXT_PUBLIC_DEMO_STUDENT_PASSWORD`
   - `NEXT_PUBLIC_DEMO_TEACHER_USERNAME`, `NEXT_PUBLIC_DEMO_TEACHER_PASSWORD`

## Run
```bash
npm install
npm run dev
```

If the Next.js cache gets into a bad state, use:
```bash
npm run dev:clean
```

## Pages
- `/` dashboard/home with progress summary
- `/modules` module sidebar + lesson content + assessment controls + locking
- `/gesture-tester` signing camera UI + prediction workflow (`/lab` permanently redirects here)
