## Summary

- What changed:
- Teacher feature affected:

## Teacher Backend Guardrails

- [ ] If this PR is on `tim`, I kept teacher-only UI work behind `frontend/lib/teacher-data.ts`
- [ ] I did not add a temporary teacher backend route on `tim`
- [ ] If real backend support was needed, I added it on a branch from `upstream/main` first
- [ ] I ran `powershell -ExecutionPolicy Bypass -File .\scripts\check-teacher-backend-alignment.ps1`
- [ ] Backend drift against `upstream/main` is either empty or intentionally synced back to match `main`

## Contract And Compatibility

- [ ] New teacher routes use `/api/teacher/<feature>` unless the feature is truly shared
- [ ] Existing student/shared routes keep their current path and meaning
- [ ] Shared response changes are backward compatible
- [ ] Data changes are additive and non-destructive

## Verification

- [ ] `npm.cmd run build` in `frontend/`
- [ ] Teacher page works in `mock` mode before real backend hookup
- [ ] Teacher page works in `real` mode after backend lands in `main`
