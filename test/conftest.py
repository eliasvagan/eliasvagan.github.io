from __future__ import annotations

from pathlib import Path

import pytest
from playwright.sync_api import Browser, Page, sync_playwright

from helpers.server import StaticServer

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = Path(__file__).resolve().parent / "output"


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture(scope="session")
def output_dir() -> Path:
    OUTPUT_DIR.mkdir(exist_ok=True)
    return OUTPUT_DIR


@pytest.fixture(scope="session")
def static_server(repo_root: Path) -> StaticServer:
    with StaticServer(repo_root) as server:
        yield server


@pytest.fixture(scope="session")
def base_url(static_server: StaticServer) -> str:
    return static_server.base_url


@pytest.fixture(scope="session")
def browser() -> Browser:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        yield browser
        browser.close()


@pytest.fixture
def page(browser: Browser) -> Page:
    context = browser.new_context()
    page = context.new_page()
    yield page
    context.close()