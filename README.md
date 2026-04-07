# FSL Learning Hub Scaffold

Monorepo scaffold for:
- `backend/` FastAPI + PostgreSQL
- `frontend/` Next.js + TypeScript + Tailwind

## Backend quick start
1. Open terminal in `backend`.
2. Create `.env` from `.env.example`.
3. Install dependencies and run:
   - `pip install -r requirements.txt`
   - `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

## Frontend quick start
1. Open terminal in `frontend`.
2. Create `.env.local` from `.env.local.example`.
3. Install dependencies and run:
   - `npm install`
   - `npm run dev`

## VS Code One-Click Run
1. Open `Run and Debug` in VS Code.
2. Select `Run Full Stack`.
3. Press `F5`.

Available launch profiles:
- `Backend: FastAPI`
- `Frontend: Next.js`
- `Run Full Stack` (starts both)

## Local database (already provided)
- Host: `localhost`
- Port: `5432`
- Database: `fsl_learning_hub`
- User: `fsl_app`
- Password: `admin123`

## Demo Access
- Student-facing pages still work in guest mode without login.
- The sidebar now includes demo account switching for:
  - `student_demo` / `student123`
  - `teacher_demo` / `teacher123`
- Backend still falls back to `student_demo` when no auth token is sent to student endpoints.
