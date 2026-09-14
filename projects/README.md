# Projects

Most interactive apps in this folder are **git submodules** with their own repository and version history.
One is not, and the exception is deliberate — see below.

| Directory | Source | Live URL |
| --- | --- | --- |
| `bingo-gen/` | submodule — [eliasvagan/bingo-gen](https://github.com/eliasvagan/bingo-gen) | [/projects/bingo-gen/](https://eliasvagan.github.io/projects/bingo-gen/) |
| `notar/` | submodule — [eliasvagan/notar](https://github.com/eliasvagan/notar) | [/projects/notar/](https://eliasvagan.github.io/projects/notar/) |
| `celestial-alliance-3/` | **built output**, committed directly | [/projects/celestial-alliance-3/](https://eliasvagan.github.io/projects/celestial-alliance-3/) |

## Why Celestial Alliance is not a submodule

Its source lives on **GitLab**, not GitHub, so a submodule here could not point at it — and it is an Angular
app, so what gets served is a *build*, not the repository. The bundle is committed directly instead, produced
by `npm run deploy:pages` in the game repo, which builds with the right `--base-href` and copies the output
here.

**It is redeployed on every version bump.** The audio is the bulk of it — roughly 77 MB, of which ~74 MB is
the soundtrack and effects — and those files do not change between versions, so git stores them once. A
routine redeploy adds only the changed JavaScript, a few megabytes at a time.

## Working on a project

```bash
# Clone this site including submodules
git clone --recurse-submodules https://github.com/eliasvagan/eliasvagan.github.io.git

# Or init submodules after a plain clone
git submodule update --init --recursive

# Work inside a project
cd projects/bingo-gen
git checkout -b my-feature
# ... edit, commit, push to github.com/eliasvagan/bingo-gen

# Point the site at your changes
cd ../..
git add projects/bingo-gen
git commit -m "Update bingo-gen submodule"
git push
```

## Adding a new project

```bash
gh repo create eliasvagan/my-project --public
git submodule add https://github.com/eliasvagan/my-project.git projects/my-project
```