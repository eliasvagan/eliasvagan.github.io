# eliasvagan.github.io

Personal site and small web tools, hosted on [GitHub Pages](https://eliasvagan.github.io/).

## Live site

**[eliasvagan.github.io](https://eliasvagan.github.io/)**

## Projects

| Project | Description | Link |
| --- | --- | --- |
| **Bingo generator** | Generate randomized, unique wedding bingo sheets as PDFs | [projects/bingo-gen/](https://eliasvagan.github.io/projects/bingo-gen/) |
| **Notar** | Browser-based melody composer with staff notation and Web Audio playback | [projects/notar/](https://eliasvagan.github.io/projects/notar/) |
| **MineSweeper JS** | Browser-based Minesweeper game | [minesweeper-js](https://eliasvagan.github.io/minesweeper-js/) |

## Repository layout

```
.
├── index.html        # Site homepage
├── projects/         # Git submodules (one repo per app)
│   ├── bingo-gen/    # Wedding bingo PDF generator
│   └── notar/        # Melody composer
├── test/             # Playwright + pytest integration tests
├── _config.yml       # Jekyll / GitHub Pages config
└── IT2/              # Archived IT coursework (HTML, CSS, JavaScript exercises)
```

The `IT2/` folder holds older school projects from weekly assignments and exams. It is kept as an archive and is not actively maintained.

## Local development

No build step required — open any `.html` file in a browser, or serve the folder locally:

```bash
git submodule update --init --recursive
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Tests

Integration tests live in [`test/`](test/). They start a local static server and use Playwright to exercise the browser apps end-to-end.

```bash
./test/run_tests.sh
```

## Deployment

Pushes to the `master` branch are published automatically via GitHub Pages.