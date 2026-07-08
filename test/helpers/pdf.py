from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


@dataclass
class PdfSummary:
    path: Path
    page_count: int
    text: str
    image_count: int

    @property
    def has_images(self) -> bool:
        return self.image_count > 0


@dataclass
class ImageStats:
    name: str
    width: int
    height: int
    white_ratio: float
    dark_ratio: float


def summarize_pdf(path: Path) -> PdfSummary:
    reader = PdfReader(str(path))
    texts: list[str] = []
    image_count = 0

    for page in reader.pages:
        texts.append(page.extract_text() or "")
        resources = page.get("/Resources")
        if not resources or "/XObject" not in resources:
            continue
        xobjects = resources["/XObject"].get_object()
        for obj in xobjects.values():
            if obj.get("/Subtype") == "/Image":
                image_count += 1

    return PdfSummary(
        path=path,
        page_count=len(reader.pages),
        text="\n".join(texts),
        image_count=image_count,
    )


def image_stats_for_page(path: Path, page_index: int = 0) -> list[ImageStats]:
    reader = PdfReader(str(path))
    page = reader.pages[page_index]
    resources = page.get("/Resources")
    if not resources or "/XObject" not in resources:
        return []

    stats: list[ImageStats] = []
    xobjects = resources["/XObject"].get_object()
    for name, obj in xobjects.items():
        if obj.get("/Subtype") != "/Image":
            continue

        data = obj.get_data()
        image = Image.open(BytesIO(data)).convert("RGB")
        pixels = list(image.get_flattened_data())
        total = len(pixels)
        white = sum(1 for r, g, b in pixels if r + g + b > 700)
        dark = sum(1 for r, g, b in pixels if r + g + b < 150)
        stats.append(
            ImageStats(
                name=str(name),
                width=image.width,
                height=image.height,
                white_ratio=white / total,
                dark_ratio=dark / total,
            )
        )
    return stats