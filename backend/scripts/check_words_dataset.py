import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.words_dataset import get_words_dataset_status  # noqa: E402


def main() -> None:
    payload = get_words_dataset_status()
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
