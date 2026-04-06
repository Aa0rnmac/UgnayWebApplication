# FSL Learning Hub Backend

## Stack
- FastAPI
- SQLAlchemy
- PostgreSQL (`psycopg`)

## Environment
1. Copy `.env.example` to `.env`.
2. Confirm DB values:
   - `postgresql+psycopg://fsl_app:admin123@localhost:5432/fsl_learning_hub`
3. Set dataset root (optional):
   - `DATASETS_ROOT=datasets` (default, resolved from project root)
   - You can also use an absolute path, for example `DATASETS_ROOT=C:\Users\Marissa\Datasets\FSL`.

## Run
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On startup, tables are created and 3 modules are seeded if empty.

## API (initial)
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/modules`
- `GET /api/modules/{module_id}`
- `POST /api/modules/{module_id}/progress`
- `GET /api/progress/summary`
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

Then continue with:
- `--batch 21-30`
- `--batch 31-40`
- `--batch 41-50`
- `--batch 51-60`
- `--batch 61-70`
- `--batch 71-80`
- `--batch 81-90`
- `--batch 91-100`

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
