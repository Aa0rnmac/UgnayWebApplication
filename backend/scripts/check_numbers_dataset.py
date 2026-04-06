import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.numbers_dataset import get_numbers_dataset_status  # noqa: E402


if __name__ == "__main__":
    print(json.dumps(get_numbers_dataset_status(), indent=2))
