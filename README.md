# FSL Learning Hub Scaffold

Monorepo scaffold for:
- `backend/` FastAPI + PostgreSQL
- `frontend/` Next.js + TypeScript + Tailwind

## New Machine Setup
Use the bootstrap script to prepare machine-specific files and install dependencies:
- `.\setup-machine.cmd`
- or `powershell -ExecutionPolicy Bypass -File .\setup-machine.ps1`

Helpful options:
- `-BackendOnly`
- `-FrontendOnly`
- `-ForceEnvCopy`
- `-SkipInstalls`
- `-DryRun`

What it does:
- creates `backend/.env` from `backend/.env.example` if missing
- creates `frontend/.env.local` from `frontend/.env.local.example` if missing
- creates `backend/.venv` if missing
- installs `backend/requirements.txt`
- runs `npm install` in `frontend/`

## Backend quick start
1. Open terminal in `backend`.
2. Create `.env` from `.env.example`.
3. Create a local virtual environment and install dependencies:
   - `py -m venv .venv`
   - `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`
4. Run the backend without relying on PowerShell activation:
   - `.\.venv\Scripts\python.exe -m alembic upgrade head`
   - `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

## Frontend quick start
1. Open terminal in `frontend`.
2. Create `.env.local` from `.env.local.example`.
3. Install dependencies and run:
   - `npm install`
   - `npm run dev`
   - If the Next.js cache is acting up, use `npm run dev:clean`

## VS Code One-Click Run
1. Open `Run and Debug` in VS Code.
2. Select `Backend: FastAPI (Reload)` or `Run Full Stack (Reload)`.
3. Press `Ctrl+F5`.

Notes:
- `Ctrl+F5` reuses a healthy backend already running on port `8000`. If nothing is running there, the launcher runs `alembic upgrade head` and then starts Uvicorn.
- `Activate.ps1` is optional. If PowerShell blocks script activation on your machine, the VS Code launch still works because it calls `backend/.venv/Scripts/python.exe` directly.
- The old stop-port prelaunch task has been retired, so the supported backend run path is only the checked-in launch profile.

Available launch profiles:
- `Backend: FastAPI (Reload)`
- `Backend: FastAPI`
- `Frontend: Next.js Dev`
- `Run Full Stack (Reload)` (starts both)
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
