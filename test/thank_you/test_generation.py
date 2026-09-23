from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image, ImageDraw
from playwright.sync_api import Page
from pypdf import PdfReader

from helpers.browser import save_blob_link

THANK_YOU_URL = "/projects/thank-you-gen/"
MESSAGES = [
    "Kjære tante Kari,|tusen takk for den nydelige vasen!",
    "Kjære Ola og Kari, takk for at dere feiret dagen med oss.",
    "Takk, Per – vi blir glade hver gang vi ser gaven!",
]
# A6 cover (148.5 × 105 mm) at 300 DPI.
COVER_PX_300 = (1754, 1240)


@pytest.fixture(scope="session")
def cover_photo(output_dir: Path) -> Path:
    path = output_dir / "thank_you_cover.jpg"
    image = Image.new("RGB", (2400, 1600), (120, 160, 220))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 1100, 2400, 1600], fill=(60, 110, 50))
    draw.ellipse([1700, 200, 2100, 600], fill=(250, 200, 60))
    image.save(path, quality=90)
    return path


def fill_form(page: Page, base_url: str, cover_photo: Path, messages: list[str] = MESSAGES) -> None:
    page.goto(f"{base_url}{THANK_YOU_URL}", wait_until="networkidle")
    page.set_input_files("#coverFile", str(cover_photo))
    page.fill("#messages", "\n".join(messages))


def generate(page: Page, destination: Path) -> PdfReader:
    page.click('button[type="submit"]')
    save_blob_link(page, ".export-download", destination, timeout_ms=60000)
    return PdfReader(str(destination))


def image_xobjects(reader: PdfReader) -> list:
    found = []
    for pdf_page in reader.pages:
        xobjects = pdf_page["/Resources"]["/XObject"]
        for ref in xobjects.values():
            if ref.get_object().get("/Subtype") == "/Image":
                found.append(ref)
    return found


class TestThankYouPage:
    def test_style_colour_and_dpi_defaults(self, page: Page, base_url: str) -> None:
        page.goto(f"{base_url}{THANK_YOU_URL}", wait_until="networkidle")
        assert page.locator("#style option").count() >= 1
        assert page.input_value("#colorMode") == "cmyk"
        assert page.input_value("#dpi") == "300"

    def test_requires_cover_image(self, page: Page, base_url: str) -> None:
        page.goto(f"{base_url}{THANK_YOU_URL}", wait_until="networkidle")
        page.fill("#messages", "Takk!")
        page.click('button[type="submit"]')
        assert "forsidebilde" in page.inner_text("#formStatus")
        assert page.locator(".export-card").count() == 0

    def test_warns_when_message_does_not_fit(self, page: Page, base_url: str, cover_photo: Path) -> None:
        fill_form(page, base_url, cover_photo, ["Takk! " * 400])
        page.wait_for_function("() => document.querySelector('#messagesWarn').textContent.includes('kort 1')")


class TestThankYouPdf:
    @pytest.fixture
    def cmyk_pdf(self, page: Page, base_url: str, output_dir: Path, cover_photo: Path) -> PdfReader:
        fill_form(page, base_url, cover_photo)
        return generate(page, output_dir / "thank_you_cmyk.pdf")

    def test_one_landscape_a4_page_per_message(self, cmyk_pdf: PdfReader) -> None:
        assert len(cmyk_pdf.pages) == len(MESSAGES)
        box = cmyk_pdf.pages[0].mediabox
        assert round(float(box.width)) == 842 and round(float(box.height)) == 595

    def test_every_page_references_the_same_cover_image(self, cmyk_pdf: PdfReader) -> None:
        refs = image_xobjects(cmyk_pdf)
        assert len(refs) == len(MESSAGES)
        assert len({ref.idnum for ref in refs}) == 1

    def test_default_cover_is_cmyk_at_300_dpi(self, cmyk_pdf: PdfReader) -> None:
        cover = image_xobjects(cmyk_pdf)[0].get_object()
        assert cover["/ColorSpace"] == "/DeviceCMYK"
        assert (int(cover["/Width"]), int(cover["/Height"])) == COVER_PX_300

    def test_messages_are_real_text(self, cmyk_pdf: PdfReader) -> None:
        texts = [p.extract_text() for p in cmyk_pdf.pages]
        assert "tusen takk for den nydelige vasen!" in texts[0]
        assert "Kjære tante Kari," in texts[0]
        assert "Takk, Per" in texts[2]
        # Signature is vector text in the embedded script face.
        assert "Line & Elias" in texts[0]

    def test_rgb_and_dpi_are_honoured(self, page: Page, base_url: str, output_dir: Path, cover_photo: Path) -> None:
        fill_form(page, base_url, cover_photo)
        page.select_option("#colorMode", "rgb")
        page.fill("#dpi", "150")
        reader = generate(page, output_dir / "thank_you_rgb.pdf")
        cover = image_xobjects(reader)[0].get_object()
        assert cover["/ColorSpace"] == "/DeviceRGB"
        assert (int(cover["/Width"]), int(cover["/Height"])) == (877, 620)


FORMATS = [
    # id, pages per card, (width, height) in pt
    ("a6-quarter", 1, (842, 595)),
    ("a6-portrait-quarter", 1, (595, 842)),
    ("a5-landscape-duplex", 2, (595, 842)),
    ("a5-portrait-duplex", 2, (842, 595)),
]


class TestFormats:
    @pytest.mark.parametrize("style_id,pages_per_card,size", FORMATS)
    def test_format_imposition(
        self, page: Page, base_url: str, output_dir: Path, cover_photo: Path,
        style_id: str, pages_per_card: int, size: tuple[int, int],
    ) -> None:
        fill_form(page, base_url, cover_photo)
        page.select_option("#style", style_id)
        reader = generate(page, output_dir / f"thank_you_{style_id}.pdf")
        assert len(reader.pages) == len(MESSAGES) * pages_per_card
        box = reader.pages[0].mediabox
        assert (round(float(box.width)), round(float(box.height))) == size
        # Every page points at the one cover object (jsPDF shares a resource dict across pages).
        assert len({ref.idnum for ref in image_xobjects(reader)}) == 1
        # Rotated faces still extract as real text.
        text = "\n".join(p.extract_text() for p in reader.pages)
        assert "tusen takk for den nydelige vasen!" in text

    def test_sheet_view_draws_every_page(self, page: Page, base_url: str, cover_photo: Path) -> None:
        fill_form(page, base_url, cover_photo)
        page.select_option("#style", "a5-landscape-duplex")
        page.click('.views button[data-view="sheet"]')
        page.wait_for_function("() => document.querySelectorAll('#sheets canvas').length === 2")


class TestTypographyAndContent:
    def test_typography_embeds_its_own_faces(self, page: Page, base_url: str, output_dir: Path, cover_photo: Path) -> None:
        fill_form(page, base_url, cover_photo)
        page.select_option("#typography", "timeless")
        reader = generate(page, output_dir / "thank_you_timeless.pdf")
        fonts = {str(f.get_object()["/BaseFont"]) for f in reader.pages[0]["/Resources"]["/Font"].values()}
        assert {"/EBGaramond-Regular", "/GreatVibes-Regular"} <= fonts
        assert "/EyesomeScript" not in fonts

    def test_merge_template_fills_columns(self, page: Page, base_url: str, output_dir: Path, cover_photo: Path) -> None:
        fill_form(page, base_url, cover_photo, ["Kari\tvasen", "Ola\tkokeboken"])
        page.click("#mergeDetails summary")
        page.fill("#template", "Kjære {1},|tusen takk for {2}!")
        reader = generate(page, output_dir / "thank_you_merge.pdf")
        texts = [p.extract_text() for p in reader.pages]
        assert "Kjære Kari," in texts[0] and "tusen takk for vasen!" in texts[0]
        assert "Kjære Ola," in texts[1] and "kokeboken" in texts[1]

    def test_quotes_and_back_monogram(self, page: Page, base_url: str, output_dir: Path, cover_photo: Path) -> None:
        fill_form(page, base_url, cover_photo, ['Takk for "alt" - det var Kari\'s idé...'])
        reader = generate(page, output_dir / "thank_you_quotes.pdf")
        text = reader.pages[0].extract_text()
        assert "«alt»" in text
        assert "Kari’s idé…" in text
        assert "–" in text
        assert "L & E" in text  # monogram derived from «Line & Elias»

    def test_black_and_white_uses_black_plate_only(self, page: Page, base_url: str, output_dir: Path, cover_photo: Path) -> None:
        fill_form(page, base_url, cover_photo, ["Takk!"])
        page.select_option("#tone", "bw")
        reader = generate(page, output_dir / "thank_you_bw.pdf")
        cover = image_xobjects(reader)[0].get_object()
        data = cover.get_data()
        # Stored inverted (/Decode [1 0 …]): 255 means no cyan, magenta or yellow.
        assert all(data[i] == 255 and data[i + 1] == 255 and data[i + 2] == 255 for i in range(0, len(data), 4 * 997))
        assert any(data[i + 3] < 255 for i in range(0, len(data), 4 * 997))

    def test_proof_sheet_has_only_the_previewed_card(self, page: Page, base_url: str, output_dir: Path, cover_photo: Path) -> None:
        fill_form(page, base_url, cover_photo)
        # The preview follows the caret, which fill() leaves on the last card.
        while page.is_enabled("#prevCard"):
            page.click("#prevCard")
        page.click("#nextCard")
        page.click("#proofBtn")
        destination = output_dir / "thank_you_proof.pdf"
        save_blob_link(page, ".export-download", destination, timeout_ms=60000)
        reader = PdfReader(str(destination))
        assert len(reader.pages) == 1
        assert "Kjære Ola og Kari" in reader.pages[0].extract_text()
