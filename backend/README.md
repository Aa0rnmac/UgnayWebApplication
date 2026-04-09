# FSL Learning Hub Backend

## Stack
- FastAPI
- SQLAlchemy
- PostgreSQL (`psycopg`)

## Environment
1. Copy `.env.example` to `.env`.
2. Confirm the production-first database values:
   - `DATABASE_URL=postgresql+psycopg://fsl_app:admin123@localhost:5432/fsl_learning_hub`
   - `AUTO_BOOTSTRAP_SCHEMA=false` for PostgreSQL
3. Use SQLite only for explicitly local bootstrap/testing:
   - `DATABASE_URL=sqlite:///./fsl_learning_hub.db`
   - `AUTO_BOOTSTRAP_SCHEMA=true`
4. Set dataset/artifact roots (optional):
   - `DATASETS_ROOT=datasets` (default, resolved from project root)
   - `ARTIFACTS_ROOT=artifacts` (default, resolved from `backend/`)
   - You can also use an absolute path, for example `DATASETS_ROOT=C:\Users\Marissa\Datasets\FSL`.
5. Configure SMTP for forgot-password OTP and student approval credential email:
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`
   - TLS/SSL flags: `SMTP_USE_TLS`, `SMTP_USE_SSL`
   - Gmail starter setup:
     - `SMTP_HOST=smtp.gmail.com`
     - `SMTP_PORT=587`
     - `SMTP_USE_TLS=true`
     - `SMTP_USE_SSL=false`
     - `SMTP_USERNAME=<your Gmail address>`
     - `SMTP_PASSWORD=<Google App Password>`
     - `SMTP_FROM_EMAIL=<same Gmail address or verified alias>`
   - Gmail requires 2-Step Verification and an App Password before SMTP login will work.
6. Configure teacher invite signing:
   - `TEACHER_INVITE_SIGNING_SECRET` (required for QR verification and onboarding tokens)
   - `TEACHER_INVITE_DEFAULT_EXPIRY_DAYS`
   - `TEACHER_INVITE_DEFAULT_MAX_USES`

## Install
```bash
pip install -r requirements.txt
```

Machine bootstrap from the repo root:
```bash
.\setup-machine.cmd
```

This creates `backend/.env` from `backend/.env.example`, creates `backend/.venv` if needed, installs backend requirements, and also prepares the frontend unless you pass `-BackendOnly`.

For VS Code debug:
- The launch profile runs `backend/.venv/Scripts/python.exe` directly, so activating the venv is optional.
- VS Code now starts `uvicorn` directly and uses the prelaunch tasks to stop any old listener on port `8000` and run `alembic upgrade head` first.
- If PowerShell blocks `Activate.ps1`, you can still use VS Code debug or run Python directly from `.venv/Scripts/python.exe`.
- Use a process-scoped bypass only when you specifically want manual activation:
```bash
powershell -ExecutionPolicy Bypass -NoProfile -File .\.venv\Scripts\Activate.ps1
```

## Migrate
```bash
alembic upgrade head
```

## Run
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On startup:
- SQLite local mode can bootstrap tables automatically.
- PostgreSQL mode expects migrations to be applied first.
- The backend seeds 12 module slots, with Modules 1-8 published and Modules 9-12 kept as draft placeholders until curriculum assets are finalized.

## API
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password/request`
- `POST /api/auth/forgot-password/verify`
- `POST /api/auth/teacher-invite/verify-qr`
- `POST /api/auth/teacher-invite/verify-passkey`
- `POST /api/auth/teacher-invite/issue-credentials`
- `POST /api/auth/teacher-invite/{invite_code}/revoke`
- `GET /api/auth/me`
- `GET /api/modules`
- `GET /api/modules/{module_id}`
- `POST /api/modules/{module_id}/activities/{activity_id_or_key}/attempts`
- `POST /api/modules/{module_id}/progress`
- `GET /api/progress/summary`
- `POST /api/registrations`
- `POST /api/registrations/{registration_id}/validate` (legacy compatibility)
- `GET /api/teacher/enrollments`
- `GET /api/teacher/enrollments/{enrollment_id}`
- `GET /api/teacher/enrollments/{enrollment_id}/payment-proof`
- `POST /api/teacher/enrollments/{enrollment_id}/approve`
- `POST /api/teacher/enrollments/{enrollment_id}/reject`
- `GET /api/teacher/batches`
- `POST /api/teacher/batches`
- `GET /api/teacher/batches/{batch_id}/students`
- `GET /api/teacher/students/{student_id}`
- `GET /api/teacher/students/{student_id}/activity-attempts`
- `GET /api/teacher/activity-attempts/{attempt_id}`
- `GET /api/teacher/reports`
- `GET /api/teacher/reports/students`
- `POST /api/teacher/reports/students/{student_id}/generate`
- `GET /api/teacher/reports/summary`
- `POST /api/lab/predict`
- `GET /api/lab/alphabet-dataset`
- `GET /api/lab/alphabet-model`
- `GET /api/lab/numbers-dataset`
- `GET /api/lab/numbers-model`
- `POST /api/lab/predict-numbers-sequence` (`number_group`: `0-10`, `11-20`, ... `91-100`)
- `GET /api/lab/words-dataset`
- `GET /api/lab/words-model`
- `POST /api/lab/predict-image`
- `POST /api/lab/predict-words-sequence`

## Student Demo Mode
- Student-facing endpoints (`/api/modules`, `/api/progress/summary`, `/api/lab/predict`) work without login.
- When no bearer token is provided, backend uses/creates `student_demo` automatically.

## Teacher QR + Passkey Invite Generation
Generate reusable teacher onboarding invite assets (QR + passkey + printable files):
```bash
python scripts/generate_teacher_invite.py --label "Main Campus"
```

Example with expiry and limited uses:
```bash
python scripts/generate_teacher_invite.py --label "Main Campus" --expires-days 14 --max-uses 3
```

Outputs:
- `backend/artifacts/teacher_invites/<invite_code>/invite_qr.png`
- `backend/artifacts/teacher_invites/<invite_code>/printable_card.png`
- `backend/artifacts/teacher_invites/<invite_code>/printable_card.pdf`

## Alphabet Dataset Check
- Dataset folder is resolved from `DATASETS_ROOT`.
- Default value: `datasets` (project root + `/datasets`).
- Kaggle zip files are optional when extracted data is already available.
- Quick check:
```bash
python scripts/check_alphabet_dataset.py
```

## Train Alphabet Model
1. Ensure Kaggle alphabet data is extracted under `<DATASETS_ROOT>/fsl_kaggle/extracted/Collated`.
2. Install requirements:
```bash
pip install -r requirements.txt
```
3. Train:
```bash
python scripts/train_alphabet_model.py
```
Optional:
```bash
python scripts/train_alphabet_model.py --max-images-per-class 300
```

Windows launcher alternative:
```bash
py scripts/train_alphabet_model.py
```

Artifacts created:
- `artifacts/alphabet_model.joblib`
- `artifacts/alphabet_training_report.json`

Optional tuning in `.env`:
- `ALPHABET_CONFIDENCE_THRESHOLD` (default `0.45`)
- `ALPHABET_MIN_TOP2_MARGIN` (default `0.08`)
- `MEDIAPIPE_DETECTION_CONFIDENCE` (default `0.5`)

## Numbers (0-9) Dataset
Use:
- https://github.com/ardamavi/Sign-Language-Digits-Dataset

Expected extracted location:
- `<DATASETS_ROOT>/numbers_digits/source/Sign-Language-Digits-Dataset-master/Dataset`
  - with subfolders `0` to `9`.

Quick check:
```bash
python scripts/check_numbers_dataset.py
```

Train numbers model:
```bash
python scripts/train_numbers_model.py
```

Artifacts created:
- `artifacts/numbers_model.joblib`
- `artifacts/numbers_training_report.json`

Train moving `10` detector (FSL-105 numbers clips):
```bash
python scripts/check_fsl_numbers_dataset.py
python scripts/train_numbers_ten_motion_model.py
```

Artifacts created:
- `artifacts/numbers_ten_motion_model.joblib`
- `artifacts/numbers_ten_motion_training_report.json`

Collect custom moving numbers `11-100` by batch (recommended):
```bash
python scripts/collect_custom_number_batches.py --batch 11-20 --samples-per-label 70 --frames-per-sample 20 --camera-index 0 --backend dshow
```

Replace existing clips for a whole batch before recollecting:
```bash
python scripts/collect_custom_number_batches.py --batch 11-20 --samples-per-label 70 --frames-per-sample 20 --camera-index 0 --backend dshow --replace-existing
```

Then continue with:
- `--batch 21-30`
- `--batch 31-40`
- `--batch 41-50`
- `--batch 51-60`
- `--batch 61-70`
- `--batch 71-80`
- `--batch 81-90`
- `--batch 91-100`

Collector controls:
- Press `R` to replace (delete) old clips for the current label folder and recollect from `1`.

Dataset output location:
- `<DATASETS_ROOT>/custom_numbers_motion/<BATCH>/<NUMBER>/*.mp4`
  - Example: `<DATASETS_ROOT>/custom_numbers_motion/11-20/11/`

Quick check collected clips:
```bash
python scripts/check_custom_numbers_motion_dataset.py
```

Train motion model for `11-100` (uses collected clips, includes optional `10` from FSL-105):
```bash
python scripts/train_numbers_motion_model.py
```

Artifacts created:
- `artifacts/numbers_motion_model.joblib`
- `artifacts/numbers_motion_training_report.json`

## Words (FSL-105, excluding numbers)
Expected files:
- `<DATASETS_ROOT>/fsl_105/processed/train_words.csv`
- `<DATASETS_ROOT>/fsl_105/processed/test_words.csv`
- `<DATASETS_ROOT>/fsl_105/processed/labels_numbers.csv`
- clip files under `<DATASETS_ROOT>/fsl_105/clips_raw/clips/...`

Quick check:
```bash
python scripts/check_words_dataset.py
```

Train words motion model:
```bash
python scripts/train_words_model.py
```

By default, words training excludes categories from:
- `WORDS_EXCLUDED_CATEGORIES` (default: `FOOD,DRINK`)

Artifacts created:
- `artifacts/words_model.joblib`
- `artifacts/words_training_report.json`

## Add Custom Phrase (Example: I LOVE YOU)
Collect webcam clips for a custom phrase label:
```bash
python scripts/collect_custom_phrase_data.py --label "I LOVE YOU" --samples 80 --frames-per-sample 20
```

Check collected custom clips:
```bash
python scripts/check_custom_words_dataset.py
```

Retrain words model (custom clips are included automatically if present):
```bash
python scripts/train_words_model.py
```

Custom clips are loaded from:
- `<DATASETS_ROOT>/custom_words/<LABEL_FOLDER>/*.mp4`

For `I LOVE YOU`, clips are stored in:
- `<DATASETS_ROOT>/custom_words/I_LOVE_YOU/`
