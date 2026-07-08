# Integration tests

Browser-based integration tests for the interactive projects in this repo.

## Setup

```bash
cd test
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
```

Or run everything in one step from the repo root:

```bash
./test/run_tests.sh
```

## Run

```bash
cd test
python3 -m pytest
```

Useful variants:

```bash
python3 -m pytest bingo/ -v
python3 -m pytest bingo/test_generation.py::TestBingoPdf -v
```

## Layout

```
test/
├── conftest.py          # Shared pytest fixtures (server, browser, output dir)
├── helpers/
│   ├── browser.py       # Playwright helpers (blob downloads, computed styles)
│   ├── pdf.py           # PDF inspection helpers
│   └── server.py        # Local static file server for tests
├── bingo/
│   └── test_generation.py
└── output/              # Generated artifacts (gitignored)
```

Tests start their own static server on a random local port, so you do not need to run `python -m http.server` manually.