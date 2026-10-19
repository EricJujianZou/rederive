# rederive

A Claude Code skill that teaches a codebase by asking questions. Point it at your own repo or any open source repo, and it leads you to work out each major design decision yourself instead of explaining the code to you.

On the first run it reads the git history and code, picks the 5 to 12 decisions that shape the project, and saves them to `.rederive/map.md` in the repo. Each session then takes one decision, describes the problem as it stood before the code existed, and asks questions that adapt to your answers until you reach the design. Each problem opens with no constraints so you can design anything, then the real constraints arrive one at a time. When you land on the real design it names it and shows the commit, then asks you to explain your design in your own words, which it saves to `.rederive/progress.md`.

## Install

```
git clone <this repo> ~/rederive
ln -s ~/rederive/skill ~/.claude/skills/rederive
```

## Use

```
/rederive                 # the repo you are in
/rederive ~/code/myapp    # a local repo
/rederive https://github.com/redis/redis
```

During a session you can type `hint`, `reveal`, `skip`, `map` or `twist`.
