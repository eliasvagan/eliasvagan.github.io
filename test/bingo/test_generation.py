from __future__ import annotations

from pathlib import Path

import pytest
from playwright.sync_api import Page

from helpers.browser import computed_font_family, save_blob_link
from helpers.pdf import image_stats_for_page, summarize_pdf

BINGO_URL = "/projects/bingo-gen/"
SAMPLE_ITEMS = [
    "Eple", "Pære", "Banan", "Appelsin",
    "Druer", "Mango", "Kiwi", "Ananas",
    "Jordbær", "Blåbær", "Sitron", "Lime",
    "Fiken", "Daddel", "Plomme", "Kirsebær",
]


def fill_bingo_form(page: Page, base_url: str, board_count: int = 2) -> None:
    page.goto(f"{base_url}{BINGO_URL}", wait_until="networkidle")
    page.fill("#things", "\n".join(SAMPLE_ITEMS))
    page.fill("#headerTemplate", "Bord $n")
    page.fill("#subtitle", "Testbingo lokalt")
    page.fill("#count", str(board_count))


def generate_pdf(page: Page, destination: Path) -> None:
    page.click('button[type="submit"]')
    save_blob_link(page, "#download", destination)


class TestBingoPage:
    def test_page_title_does_not_use_pdf_heading_font(self, page: Page, base_url: str) -> None:
        fill_bingo_form(page, base_url, board_count=1)
        font_family = computed_font_family(page, "h1")
        assert "BingoPdfHeading" not in font_family
        assert "Beautifully" not in font_family
        assert "Georgia" in font_family


class TestBingoPdf:
    @pytest.fixture
    def pdf_path(self, page: Page, base_url: str, output_dir: Path) -> Path:
        destination = output_dir / "bingo_test.pdf"
        fill_bingo_form(page, base_url, board_count=2)
        generate_pdf(page, destination)
        return destination

    def test_generates_expected_number_of_pages(self, pdf_path: Path) -> None:
        summary = summarize_pdf(pdf_path)
        assert summary.page_count == 2

    def test_contains_sample_items(self, pdf_path: Path) -> None:
        summary = summarize_pdf(pdf_path)
        # Heading/subtitle are rasterized with custom fonts (not extractable text).
        for item in SAMPLE_ITEMS:
            assert item in summary.text

    def test_embeds_heading_and_subtitle_images(self, pdf_path: Path) -> None:
        summary = summarize_pdf(pdf_path)
        assert summary.has_images
        # Two pages × (heading + subtitle) images
        assert summary.image_count >= 4

    def test_title_images_have_visible_ink(self, pdf_path: Path) -> None:
        for page_index in range(2):
            stats = image_stats_for_page(pdf_path, page_index=page_index)
            assert stats, f"Expected image objects on page {page_index + 1}"
            inked = [image for image in stats if image.dark_ratio >= 0.02 and image.white_ratio >= 0.80]
            assert len(inked) >= 2, f"Expected heading+subtitle ink on page {page_index + 1}, got {stats}"