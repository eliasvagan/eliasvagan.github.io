# Projects

Each interactive app in this folder is a **git submodule** with its own repository and version history.

| Directory | Repository | Live URL |
| --- | --- | --- |
| `bingo-gen/` | [eliasvagan/bingo-gen](https://github.com/eliasvagan/bingo-gen) | [/projects/bingo-gen/](https://eliasvagan.github.io/projects/bingo-gen/) |
| `notar/` | [eliasvagan/notar](https://github.com/eliasvagan/notar) | [/projects/notar/](https://eliasvagan.github.io/projects/notar/) |

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