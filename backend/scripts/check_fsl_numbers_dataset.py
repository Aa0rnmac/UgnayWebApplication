import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.fsl_numbers_dataset import load_fsl_number_clip_rows  # noqa: E402


def main() -> None:
    train_rows = load_fsl_number_clip_rows("train", existing_only=False)
    test_rows = load_fsl_number_clip_rows("test", existing_only=False)
    train_found = [item for item in train_rows if item.clip_path.is_file()]
    test_found = [item for item in test_rows if item.clip_path.is_file()]

    payload = {
        "train_rows": len(train_rows),
        "test_rows": len(test_rows),
        "train_found": len(train_found),
        "test_found": len(test_found),
        "available_digits": sorted({item.digit for item in [*train_found, *test_found]}),
        "ten_train_count": sum(1 for item in train_found if item.digit == "10"),
        "ten_test_count": sum(1 for item in test_found if item.digit == "10"),
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
