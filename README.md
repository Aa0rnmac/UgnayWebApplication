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

## Local database (default)
- `backend/.env` currently points to `sqlite:///./fsl_learning_hub.db`
- The local SQLite file lives in `backend/fsl_learning_hub.db`
- You can still switch `DATABASE_URL` to PostgreSQL later if needed

## Local ML storage
- `backend/.env` now points datasets to `D:\MEGA\datasets`
- `backend/.env` now points trained model artifacts to `D:\MEGA\artifacts`

## Demo Access
- Student-facing pages still work in guest mode without login.
- The login screen includes demo account switching for:
  - `student_demo` / `student123`
  - `teacher_demo` / `teacher123`
- Backend still falls back to `student_demo` when no auth token is sent to student endpoints.

## Teacher Backend Guardrails
- Teacher UI exploration happens on `tim`, but real backend contracts must come from `upstream/main`
- Use `docs/teacher-backend-workflow.md` before adding teacher features that need backend support
- Define new teacher backend work with `docs/templates/teacher-backend-contract.md`
- Run the backend drift check before review:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\check-teacher-backend-alignment.ps1`
