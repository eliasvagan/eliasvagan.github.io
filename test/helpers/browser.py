from __future__ import annotations

import base64
from pathlib import Path

from playwright.sync_api import Page


def computed_font_family(page: Page, selector: str) -> str:
    return page.eval_on_selector(selector, "el => getComputedStyle(el).fontFamily")


def wait_for_blob_download_link(page: Page, link_selector: str, timeout_ms: int = 15000) -> None:
    page.wait_for_function(
        """(selector) => {
            const link = document.querySelector(selector);
            return link && link.style.display !== 'none' && link.href.startsWith('blob:');
        }""",
        arg=link_selector,
        timeout=timeout_ms,
    )


def save_blob_link(page: Page, link_selector: str, destination: Path) -> None:
    wait_for_blob_download_link(page, link_selector)
    blob_b64 = page.evaluate(
        """async (selector) => {
            const href = document.querySelector(selector).href;
            const response = await fetch(href);
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(binary);
        }""",
        arg=link_selector,
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(base64.b64decode(blob_b64))