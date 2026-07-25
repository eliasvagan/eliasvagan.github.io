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

        image = _pdf_xobject_to_rgb(obj)
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


def _pdf_xobject_to_rgb(obj) -> Image.Image:
    """Decode a PDF image XObject to RGB, compositing soft masks on white."""
    data = obj.get_data()
    # Embedded JPEG/PNG streams open directly; Flate RGB (jsPDF PNG) does not.
    try:
        raw = Image.open(BytesIO(data))
        if raw.mode in ("RGBA", "LA") or (raw.mode == "P" and "transparency" in raw.info):
            rgba = raw.convert("RGBA")
            bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            return Image.alpha_composite(bg, rgba).convert("RGB")
        return raw.convert("RGB")
    except Exception:
        pass

    width = int(obj["/Width"])
    height = int(obj["/Height"])
    color_space = obj.get("/ColorSpace")
    if color_space == "/DeviceRGB" or getattr(color_space, "name", None) == "/DeviceRGB":
        mode = "RGB"
        expected = width * height * 3
    elif color_space == "/DeviceGray" or getattr(color_space, "name", None) == "/DeviceGray":
        mode = "L"
        expected = width * height
    else:
        raise ValueError(f"Unsupported ColorSpace for image stats: {color_space}")

    if len(data) < expected:
        raise ValueError(f"Image data too short: {len(data)} < {expected}")
    image = Image.frombytes(mode, (width, height), data[:expected])
    if mode != "RGB":
        image = image.convert("RGB")

    if "/SMask" in obj:
        smask = obj["/SMask"].get_object()
        alpha = _pdf_xobject_to_rgb(smask).convert("L")
        rgba = image.convert("RGBA")
        rgba.putalpha(alpha)
        bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        image = Image.alpha_composite(bg, rgba).convert("RGB")

    return image