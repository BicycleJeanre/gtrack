#!/usr/bin/env python3
"""Build compact thumbnail atlases for the bundled exercise library."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageOps


CELL = 128
COLUMNS = 10
PER_SHEET = 100


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip()).lower()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(
            "Usage: python3 scripts/build-exercise-thumbnails.py /path/to/free-exercise-db"
        )

    root = Path(__file__).resolve().parents[1]
    source_root = Path(sys.argv[1]).resolve()
    source = json.loads((source_root / "dist/exercises.json").read_text())
    catalogue = json.loads((root / "src/exercise-catalog.json").read_text())
    guides = json.loads((root / "src/exercise-guides.json").read_text())
    generated_root = root / "src/assets/exercise-thumbnail-sources"
    output_root = root / "src/assets/exercise-thumbnails"
    output_root.mkdir(parents=True, exist_ok=True)

    by_name = {normalize(item["name"]): item for item in source}
    generated = {
        normalize("Kettlebell Halo"): generated_root / "Kettlebell_Halo.webp",
        normalize("Kettlebell Halo with Overhead Extension"): generated_root
        / "Kettlebell_Halo_With_Overhead_Extension.webp",
        normalize("Kettlebell Overhead Triceps Extension"): generated_root
        / "Kettlebell_Overhead_Triceps_Extension.webp",
        normalize("Dumbbell Romanian deadlift"): generated_root
        / "Dumbbell_Romanian_Deadlift.webp",
        normalize("Hanging knee raise"): generated_root / "Hanging_Knee_Raise.webp",
    }

    items: list[tuple[str, Path]] = []
    seen: set[str] = set()

    def add(name: str, image: Path) -> None:
        key = normalize(name)
        if key not in seen:
            seen.add(key)
            items.append((key, image))

    for exercise in catalogue:
        key = normalize(exercise["name"])
        source_exercise = by_name[key]
        if source_exercise.get("images"):
            image = source_root / "exercises" / source_exercise["images"][0]
        else:
            image = generated[key]
        add(exercise["name"], image)

    for guide in guides:
        key = normalize(guide["name"])
        if key in seen:
            continue
        if guide.get("images"):
            image = source_root / "exercises" / guide["images"][0]
        else:
            image = generated[key]
        add(guide["name"], image)

    missing = [str(image) for _, image in items if not image.is_file()]
    if missing:
        raise SystemExit("Missing source images:\n" + "\n".join(missing))

    mapping: dict[str, list[int]] = {}
    sheets: list[Image.Image] = []
    for index, (name, image_path) in enumerate(items):
        sheet_index = index // PER_SHEET
        cell_index = index % PER_SHEET
        while len(sheets) <= sheet_index:
            sheets.append(Image.new("RGB", (CELL * COLUMNS, CELL * COLUMNS), "white"))
        with Image.open(image_path) as source_image:
            source_image = source_image.convert("RGB")
            thumb = ImageOps.contain(source_image, (CELL, CELL), Image.Resampling.LANCZOS)
            cell = Image.new("RGB", (CELL, CELL), "white")
            cell.paste(
                thumb,
                ((CELL - thumb.width) // 2, (CELL - thumb.height) // 2),
            )
        column = cell_index % COLUMNS
        row = cell_index // COLUMNS
        sheets[sheet_index].paste(cell, (column * CELL, row * CELL))
        mapping[name] = [sheet_index, cell_index]

    for old_sheet in output_root.glob("sheet-*.webp"):
        old_sheet.unlink()
    for index, sheet in enumerate(sheets):
        sheet.save(
            output_root / f"sheet-{index}.webp",
            "WEBP",
            quality=70,
            method=6,
        )

    (root / "src/exercise-thumbnails.json").write_text(
        json.dumps(mapping, separators=(",", ":"), ensure_ascii=False) + "\n"
    )
    print(f"Built {len(items)} thumbnails in {len(sheets)} sheets")


if __name__ == "__main__":
    main()
