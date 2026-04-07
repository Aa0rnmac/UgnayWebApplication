from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops


LETTERS: tuple[str, ...] = (
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
)
EXTENSIONS: tuple[str, ...] = (".png", ".jpg", ".jpeg", ".webp")
THRESHOLD = 12


def find_source_file(raw_dir: Path, letter: str) -> Path | None:
    candidates: list[Path] = []
    for name in (letter, letter.upper()):
        for ext in EXTENSIONS:
            candidates.append(raw_dir / f"{name}{ext}")
    for path in candidates:
        if path.exists():
            return path
    return None


def crop_non_white_area(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    white_bg = Image.new("RGB", rgb.size, (255, 255, 255))
    diff = ImageChops.difference(rgb, white_bg).convert("L")
    mask = diff.point(lambda value: 255 if value > THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return rgb
    return rgb.crop(bbox)


def ensure_dirs(paths: Iterable[Path]) -> None:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    raw_dir = repo_root / "public" / "module-assets" / "m1" / "raw"
    output_dir = repo_root / "public" / "module-assets" / "m1" / "ai"
    ensure_dirs((raw_dir, output_dir))

    print(f"Input folder : {raw_dir}")
    print(f"Output folder: {output_dir}")
    print("Cropping images to remove outer white margins...")

    found_count = 0
    for letter in LETTERS:
        source = find_source_file(raw_dir, letter)
        if source is None:
            print(f"- Missing source for letter {letter.upper()} (expected {letter}.png/.jpg/.jpeg/.webp)")
            continue

        with Image.open(source) as image:
            cropped = crop_non_white_area(image)
            target = output_dir / f"{letter}.png"
            cropped.save(target, format="PNG")
            found_count += 1
            print(f"- Saved {target.name} from {source.name} ({cropped.width}x{cropped.height})")

    print(f"Done. Cropped {found_count} card(s).")


if __name__ == "__main__":
    main()
