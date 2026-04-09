# Teacher Backend Workflow

This repo uses `tim` for teacher UI exploration, but uses `upstream/main` as the only source of
truth for real backend contracts.

## Core Rule

Do not build a second backend version on `tim`.

- Teacher UI work may continue on `tim`
- Mock teacher data is allowed in `frontend/lib/teacher-data.ts`
- Real backend work must start from `upstream/main`
- `tim` may only consume real teacher backend support after it lands in `main`

## Choose The Right Path

### Path A: Teacher feature does not need backend support yet

Use mock mode first.

1. Add the UI behind the teacher provider layer in `frontend/lib/teacher-data.ts`
2. Return `mock` data with the same UI-facing shape the future real endpoint will use
3. Keep the page implementation dependent on the provider, not on a temporary backend route
4. Do not edit `backend/` on `tim`

### Path B: Teacher feature needs real backend support

Use the main-first backend flow.

1. Write the backend contract before coding using the template in
   `docs/templates/teacher-backend-contract.md`
2. Create a backend branch from `upstream/main`
3. Add the backend support in an additive way
4. Merge the backend change to `main`
5. Sync `main` into `tim`
6. Switch the teacher provider from `mock` to `real`

## Backend Rules

### Routes

- Prefer new teacher-only routes under `/api/teacher/<feature>`
- Do not rename or repurpose shared student routes for teacher-only behavior
- Extend shared routes only when the existing student contract remains backward compatible

### Schemas

- Never remove or rename fields already used by existing frontend code
- If a shared response must grow, only add optional fields
- Keep teacher-specific shapes separate from shared student shapes when possible

### Data changes

- Prefer new tables, nullable columns, or safe defaults
- Avoid destructive changes in the same rollout
- Any backfill must be safe to rerun and must not block current student flows

### Auth

- Teacher-only routes must explicitly enforce teacher access
- Shared routes must keep their current auth behavior

## Review Guardrails

### Manual backend alignment check

Run this before review on `tim`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-teacher-backend-alignment.ps1
```

Expected result:

- success if `backend/` matches `upstream/main`
- failure if `tim` is carrying backend drift

### Manual review rule

Reject a `tim` PR when tracked `backend/` changes are present unless the backend has been synced to
exactly match `upstream/main`.

### Required teacher feature checks

- Teacher pages use `frontend/lib/teacher-data.ts`
- No teacher page points at a backend route that does not exist on `main`
- `npm.cmd run build` passes in `frontend/`

## Existing Main-Backed Surface

Current mounted backend routes in `main` are:

- `/api/auth/*`
- `/api/health`
- `/api/lab/*`
- `/api/modules`
- `/api/progress/*`
- `/api/registrations`
- `/api/teacher/reports*`

If a teacher feature needs anything else, define it as a new contract first.
