import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.custom_words_dataset import get_custom_words_dataset_status  # noqa: E402


def main() -> None:
    print(json.dumps(get_custom_words_dataset_status(), indent=2))


if __name__ == "__main__":
    main()
