# Teacher Backend Contract Proposal

Use this before building a teacher feature that needs real backend support.

## Feature

- Name:
- Teacher page or flow:
- Why mock mode is no longer enough:

## Route Proposal

- Path:
- Method:
- Owner:
- Scope:
  - `teacher-only`
  - `shared`

## Auth And Access

- Required role:
- Which existing dependency will enforce access:
- Expected response for non-teacher users:

## Request Shape

- Query params:
- Path params:
- Body:

```json
{}
```

## Response Shape

- Success payload:

```json
{}
```

- Error cases:
  - `400`:
  - `401`:
  - `403`:
  - `404`:
  - `409`:

## Compatibility Rules

- Existing student/shared routes affected:
- Backward compatibility guarantee:
- Any new optional fields added to shared responses:

## Data Model Changes

- New tables:
- New columns:
- Safe defaults or nullability:
- Backfill needed:

## Frontend Provider Mapping

- Provider entry in `frontend/lib/teacher-data.ts`:
- Mock shape to keep identical:
- Switch condition from `mock` to `real`:

## Verification

- Existing routes rechecked:
  - `/api/auth/*`
  - `/api/modules`
  - `/api/progress/*`
  - `/api/lab/*`
  - `/api/registrations`
- Teacher auth confirmed:
- Serialization confirmed:
- Frontend build confirmed:
