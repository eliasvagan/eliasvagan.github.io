#!/usr/bin/env node
/**
 * **Regenerate the front page's project sections** — Selected work and the Lab: picture, blurb, version and
 * last update, from one manifest (`projects.json`).
 *
 * The list was four hand-written `<li>`s with no picture and no version, so a visitor could not tell what any
 * of them looked like or which build they were about to open. Adding a project meant editing markup; noticing
 * a stale version meant remembering to.
 *
 *     npm run projects            # versions + screenshots + rewrite index.html
 *     npm run projects -- --no-shots   # versions and markup only, which is the fast path
 *     npm run projects -- --only <id>  # shoot one project, leaving the other three's PNGs alone
 *
 * `--only` exists for the deploy scripts. A deploy is the one moment a project's *appearance* can have
 * changed, and it used to pass `--no-shots` — because at the point it ran, the new build was not live yet and
 * a shot would have photographed the previous one, and because shooting four sites to refresh one is three
 * sites of waste. So the version was restamped on every deploy and the thumbnail was not, and a card could
 * carry this week's version over a picture from a month ago. A deploy now waits for its own bundle to be
 * served and *then* shoots itself, which is both objections answered rather than traded.
 *
 * ## Where a version comes from
 *
 * Versions are resolved on every build, never written into the page by hand. The first answer wins:
 *
 * | source | used by | what it reads |
 * | --- | --- | --- |
 * | `deployed` | AlkoMax, Celestial Alliance 3 | `project.json` that the project's own deploy writes next to its
 *   index.html from its package.json (version, description, card picture): the build folder on this server,
 *   otherwise the live site, e.g. https://alkomax.no/project.json |
 * | `submodule` | Notar, Bingo generator, Minesweeper | at the **pinned commit**: `version` in package.json, then
 *   project.json, then the latest git tag reachable from the pin |
 * | `path` / `package.json` | Thank-you card generator | the same, for a folder (or one package.json) committed here |
 * | `github` | (none at the moment) | the latest tag, else the default branch's head |
 *
 * A project that declares no version anywhere uses `version.fallback` from projects.json (or `"version": "1.2.0"`
 * as a plain string), and failing that the pinned commit, which is still the precise answer to *"which build is
 * behind this link"*. The label's tooltip says which of these it is.
 *
 * ## Two groups: Selected work and the Lab
 *
 * Each project has a `status`. `featured` ones are the portfolio proper: finished, live products, drawn large
 * and image-led, the first across the full width. `in-progress` ones (and anything with no status, so nothing is
 * promoted by accident) go to the **Lab** further down the same page: a quiet one-line index with a small
 * greyscale thumbnail and the date of its last update, which is the honest marker for work that is still moving.
 * The Lab is a section rather than its own page because it is three short rows; a separate page would be
 * thinner than the section, and one page stays one request.
 *
 * Only the block between the markers in `index.html` is rewritten (both sections, headings included, so an empty
 * group disappears rather than leaving a heading over nothing); the rest of the page stays hand-edited. The
 * output depends only on the manifest, git and the deployed metadata, so running it twice changes nothing.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SHOTS = join(ROOT, 'assets/projects');

const withShots = !process.argv.includes('--no-shots');
/**
 * Which project to shoot, or every one of them.
 *
 * Only the **shot** is narrowed. Versions and markup are regenerated for every project whatever this says, because
 * the page is rewritten whole and a card left out of it would simply disappear.
 */
const onlyId = (() => {
  const at = process.argv.indexOf('--only');
  return at > -1 ? process.argv[at + 1] : null;
})();
const manifest = JSON.parse(readFileSync(join(ROOT, 'projects.json'), 'utf8'));
const STATUSES = ['featured', 'in-progress'];
for (const project of manifest.projects) {
  project.status ??= 'in-progress';
  // `"version": "1.2.0"` is shorthand for a version the project does not declare anywhere else.
  if (typeof project.version === 'string') project.version = { from: 'literal', value: project.version };
  if (!STATUSES.includes(project.status)) {
    console.error(`\nprojects.json: ${project.id} has status "${project.status}"; use one of ${STATUSES.join(', ')}.`);
    process.exit(1);
  }
}

const START = '<!-- projects:start — generated by scripts/update-projects.mjs; edit projects.json instead -->';
const END = '<!-- projects:end -->';

/** Short enough to read at a glance in a corner, long enough to be unambiguous. */
const shortSha = (sha) => sha.trim().slice(0, 7);

/**
 * What a deployed project says about itself: `{ version, description, image, commit }`.
 *
 * On the server the build is a folder (`dir`); anywhere else it is read over HTTPS from the live site. A
 * project whose metadata cannot be read keeps the blurb and picture in projects.json and shows no version.
 */
async function deployedMeta(project) {
  const source = project.version;
  if (source.from !== 'deployed') return null;
  try {
    if (source.dir && existsSync(join(source.dir, 'project.json'))) {
      return JSON.parse(readFileSync(join(source.dir, 'project.json'), 'utf8'));
    }
    const response = await fetch(new URL('project.json', source.url));
    if (response.ok) return await response.json();
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.warn(`  ${project.id}: no deployed metadata (${error.message.split('\n')[0]})`);
    return null;
  }
}

/** `3.4.2` → `v3.4.2`; a tag that already says `v1.0` or `2026.1-beta` is left as written. */
const semver = (value) => {
  const text = String(value ?? '').trim();
  return !text ? null : /^\d/.test(text) ? `v${text}` : text;
};

/**
 * The pinned commit of a submodule (what this repo *serves*), or the last commit touching a folder in this repo.
 * `git submodule status --cached` reports the pin rather than whatever happens to be checked out.
 */
function pinOf(source) {
  if (source.from === 'submodule') {
    return git(['submodule', 'status', '--cached', source.path]).replace(/^[-+U]/, '').split(' ')[0];
  }
  if (source.from === 'path' || source.from === 'package.json') {
    const sha = git(['log', '-1', '--format=%H', '--', source.path]);
    if (!sha) throw new Error(`no commits touch ${source.path}`);
    return sha;
  }
  return null;
}

/**
 * A version the project itself declares, at exactly the build the site serves: `version` in its package.json,
 * then in a project.json next to it, then the latest git tag reachable from the pinned commit. For a submodule
 * the files are read *at the pin* (`git show <sha>:package.json`), not from a checkout that may have moved.
 */
function declaredVersion(source, pin) {
  const dir = source.from === 'package.json' ? dirname(source.path) : source.path;
  const inSub = source.from === 'submodule';
  const read = (name) => {
    try {
      const text = inSub
        ? git(['show', `${pin}:${name}`], resolve(ROOT, dir))
        : readFileSync(resolve(ROOT, dir, name), 'utf8');
      return JSON.parse(text).version ?? null;
    } catch {
      return null;
    }
  };
  for (const name of source.from === 'package.json' ? [basename(source.path)] : ['package.json', 'project.json']) {
    const version = read(name);
    if (version) return { version: semver(version), from: name };
  }
  try {
    const tag = inSub
      ? git(['describe', '--tags', '--abbrev=0', pin], resolve(ROOT, dir))
      : git(['describe', '--tags', '--abbrev=0', pin]);
    if (tag) return { version: semver(tag), from: 'git tag' };
  } catch { /* no tags */ }
  return null;
}

/**
 * The version shown on a card, and where it came from (the label's tooltip says so). In order:
 *
 *   1. what the project declares: the deployed project.json (`deployed`: on this server the build folder,
 *      anywhere else the live site), or package.json / project.json / latest tag at the pinned commit;
 *   2. the manifest's own `version.fallback` (or `version` written as a plain string) for a project that
 *      declares nothing;
 *   3. the pinned commit itself, which is still the precise answer to "which build is behind this link".
 *
 * A version that cannot be resolved is omitted rather than guessed: a wrong one is worse than none.
 */
async function versionOf(project, meta) {
  const source = project.version;
  const fallback = source.fallback ? { version: semver(source.fallback), from: 'projects.json' } : null;
  try {
    if (source.from === 'literal') return { version: semver(source.value), from: 'projects.json' };
    if (source.from === 'deployed') {
      if (meta?.version) return { version: semver(meta.version), from: 'deployed project.json' };
      return fallback;
    }
    if (source.from === 'github') {
      const tags = await fetch(`https://api.github.com/repos/${source.repo}/tags?per_page=1`);
      const [tag] = tags.ok ? await tags.json() : [];
      if (tag?.name) return { version: semver(tag.name), from: 'git tag' };
      if (fallback) return fallback;
      const response = await fetch(`https://api.github.com/repos/${source.repo}/commits?per_page=1`);
      if (!response.ok) return null;
      const [head] = await response.json();
      return head?.sha ? { version: shortSha(head.sha), from: 'commit', commit: true } : null;
    }
    const pin = pinOf(source);
    return declaredVersion(source, pin) ?? fallback ?? { version: shortSha(pin), from: 'commit', commit: true };
  } catch (error) {
    console.warn(`  ${project.id}: no version (${error.message.split('\n')[0]})`);
  }
  return fallback;
}

const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * When the build behind the link last changed, as `YYYY-MM-DD` — the Lab's marker.
 *
 * Read from the same place as the version, so the two cannot disagree: the pinned commit's own date for a
 * submodule (falling back to when the pin moved, if the submodule is not checked out), the last commit touching
 * the folder for `path`, the head's date for `github`, and the deployed `project.json` for `deployed`.
 */
async function updatedOf(project, meta) {
  const source = project.version;
  try {
    if (source.from === 'submodule') {
      const sha = git(['submodule', 'status', '--cached', source.path]).replace(/^[-+U]/, '').split(' ')[0];
      try {
        return git(['log', '-1', '--format=%cs', sha], resolve(ROOT, source.path)) || null;
      } catch {
        return git(['log', '-1', '--format=%cs', '--', source.path]) || null;
      }
    }
    if (source.from === 'path' || source.from === 'package.json') {
      return git(['log', '-1', '--format=%cs', '--', source.path]) || null;
    }
    if (source.from === 'github') {
      const response = await fetch(`https://api.github.com/repos/${source.repo}/commits?per_page=1`);
      if (!response.ok) return null;
      const [head] = await response.json();
      return head?.commit?.committer?.date?.slice(0, 10) ?? null;
    }
    if (source.from === 'deployed') {
      if (meta?.date) return String(meta.date).slice(0, 10);
      if (source.dir && existsSync(join(source.dir, 'project.json'))) {
        return statSync(join(source.dir, 'project.json')).mtime.toISOString().slice(0, 10);
      }
    }
  } catch (error) {
    console.warn(`  ${project.id}: no update date (${error.message.split('\n')[0]})`);
  }
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-09-28` → `28 Sep 2026`, by hand so the output does not depend on the machine's locale data. */
const longDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/**
 * Walk the page to the frame worth showing.
 *
 * A splash screen and a single "Play latest version" link are both *the front door*, and a front door is not
 * a picture of the thing behind it. Rather than special-case two projects, the manifest says what to press —
 * and, for a portrait layout in a landscape frame, how far to scroll so the board is the part in shot.
 */
async function walk(page, steps = []) {
  for (const step of steps) {
    if (step.key) await page.keyboard.press(step.key);
    if (step.click) await page.locator(step.click).click();
    if (step.scrollY) await page.evaluate((y) => window.scrollTo(0, y), step.scrollY);
    if (step.waitMs) await new Promise((done) => setTimeout(done, step.waitMs));
  }
}

async function shoot(project) {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    // 2:1 at retina, which is the aspect the card reserves — a screenshot cropped by CSS wastes the bytes it
    // spent downloading, and one letterboxed by CSS advertises that nobody looked at it.
    await page.setViewport({ deviceScaleFactor: 2, height: 600, width: 1200 });
    await page.goto(project.shot.url, { timeout: 60_000, waitUntil: 'networkidle2' });
    await new Promise((done) => setTimeout(done, project.shot.settleMs ?? 2500));
    await walk(page, project.shot.steps);
    await page.screenshot({ path: join(SHOTS, `${project.id}.png`) });
    console.log(`  ${project.id}: shot`);
  } catch (error) {
    // One unreachable site must not cost the other three their run. The previous PNG stays on disk and
    // the card still renders — stale, and said out loud, which beats a page that half-rebuilt in silence.
    console.warn(`  ${project.id}: SHOT FAILED — keeping the old one (${error.message.split('\n')[0]})`);
  } finally {
    await browser.close();
  }
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The quiet version label: small muted monospace, with where it came from in the tooltip. */
function versionLabel(resolved) {
  if (!resolved?.version) return '';
  const title = resolved.commit ? `Build ${resolved.version}: the commit this site serves (no version declared)` : `Version ${resolved.version} (${resolved.from})`;
  return `<code class="version" title="${escape(title)}">${escape(resolved.version)}</code>`;
}

/** A line icon, drawn in currentColor so it follows the text it sits in. */
const ARROW = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5"/></svg>';
const CLOCK = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></svg>';

/**
 * The picture for a card. A deployed project brings its own (package.json `image`, published as part of the
 * build); on the server the file is copied next to the other thumbnails, so the page never depends on another
 * host. Everything else uses the screenshot this script takes.
 */
function pictureOf(project, meta) {
  let own = meta?.image ? new URL(meta.image, project.version.url).href : null;
  const local = meta?.image && project.version.dir ? join(project.version.dir, meta.image) : null;
  if (local && existsSync(local)) {
    const name = `${project.id}${extname(meta.image)}`;
    copyFileSync(local, join(SHOTS, name));
    own = `/assets/projects/${name}`;
  }
  if (own) return own;
  return existsSync(join(SHOTS, `${project.id}.png`)) ? `/assets/projects/${project.id}.png` : null;
}

/**
 * The image is decorative next to the title it illustrates (the link is named by its text), hence `alt=""`.
 * Only the lead picture loads eagerly: it is the largest thing above the fold, and everything else can wait.
 */
const img = (src, eager) => `<img src="${src}" alt="" width="1200" height="600" decoding="async" ${
  eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`;

function featured(project, index) {
  const { blurb, picture, version } = project.resolved;
  const frame = picture ? `\n\t\t\t\t\t\t<span class="frame">${img(picture, index === 0)}</span>` : '';
  const kind = project.kind ? `<span class="kind">${escape(project.kind)}</span>` : '';
  const stamp = versionLabel(version);
  return `\t\t\t\t<li>
\t\t\t\t\t<a href="${project.href}">${frame}
\t\t\t\t\t\t<span class="work-text">
\t\t\t\t\t\t\t<span class="meta">${kind}${stamp}</span>
\t\t\t\t\t\t\t<strong class="work-title"><span>${escape(project.title)}</span>${ARROW}</strong>
\t\t\t\t\t\t\t<span class="blurb">${escape(blurb)}</span>
\t\t\t\t\t\t</span>
\t\t\t\t\t</a>
\t\t\t\t</li>`;
}

function lab(project) {
  const { blurb, picture, updated, version } = project.resolved;
  const thumb = picture ? `<span class="thumb">${img(picture, false)}</span>` : '<span class="thumb"></span>';
  // The date says how alive it is; the version sits by the title for whoever wants it.
  const when = updated ? `${CLOCK}<time datetime="${updated}">Updated ${longDate(updated)}</time>` : '';
  return `\t\t\t\t<li>
\t\t\t\t\t<a href="${project.href}">
\t\t\t\t\t\t${thumb}
\t\t\t\t\t\t<span class="lab-text">
\t\t\t\t\t\t\t<span class="lab-head"><strong class="lab-title">${escape(project.title)}</strong>${versionLabel(version)}</span>
\t\t\t\t\t\t\t<span class="blurb">${escape(blurb)}</span>
\t\t\t\t\t\t</span>
\t\t\t\t\t\t<span class="meta">${when}</span>
\t\t\t\t\t</a>
\t\t\t\t</li>`;
}

const two = (n) => String(n).padStart(2, '0');

function sections(projects) {
  const work = projects.filter((p) => p.status === 'featured');
  // Most recently touched first: the Lab is about what is moving. Undated ones keep manifest order, last.
  const wip = projects.filter((p) => p.status !== 'featured')
    .map((p, i) => [p, i])
    .sort(([a, i], [b, j]) => (b.resolved.updated ?? '').localeCompare(a.resolved.updated ?? '') || i - j)
    .map(([p]) => p);
  const out = [];
  if (work.length) {
    out.push(`\t\t<section id="work" aria-labelledby="work-title">
\t\t\t<div class="section-head"><h2 id="work-title">Selected work</h2><span class="count">${two(work.length)}</span></div>
\t\t\t<ul class="work">
${work.map(featured).join('\n')}
\t\t\t</ul>
\t\t</section>`);
  }
  if (wip.length) {
    out.push(`\t\t<section id="lab" aria-labelledby="lab-title">
\t\t\t<div class="section-head"><h2 id="lab-title">Lab</h2><span class="count">${two(wip.length)}</span></div>
\t\t\t<p class="lab-note">Smaller tools, sketches and things still taking shape.</p>
\t\t\t<ul class="lab">
${wip.map(lab).join('\n')}
\t\t\t</ul>
\t\t</section>`);
  }
  return out.join('\n');
}

mkdirSync(SHOTS, { recursive: true });

console.log(`\n▸ ${manifest.projects.length} projects`);
for (const project of manifest.projects) {
  const meta = await deployedMeta(project);
  const version = await versionOf(project, meta);
  const updated = project.status === 'featured' ? null : await updatedOf(project, meta);
  console.log(`  ${project.id.padEnd(22)} ${project.status.padEnd(12)} ${version ? `${version.version} (${version.from})` : '(no version)'}${updated ? `  ${updated}` : ''}`);
  // Deployed projects' pictures come with their build, so they are never shot from here.
  if (withShots && !meta && (!onlyId || project.id === onlyId)) await shoot(project);
  project.resolved = { blurb: meta?.description || project.blurb, picture: pictureOf(project, meta), updated, version };
}

const indexPath = join(ROOT, 'index.html');
const page = readFileSync(indexPath, 'utf8');
const from = page.indexOf(START);
const to = page.indexOf(END);

if (from < 0 || to < 0) {
  console.error(`\nindex.html has no ${START} / ${END} markers — add them inside <main>.`);
  process.exit(1);
}

writeFileSync(indexPath, `${page.slice(0, from + START.length)}\n${sections(manifest.projects)}\n\t\t${page.slice(to)}`);
console.log('\n▸ index.html rewritten\n');
