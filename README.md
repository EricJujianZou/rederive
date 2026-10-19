# rederive

A Claude Code skill that teaches a codebase by asking questions. Point it at your own repo or any open source repo, and it leads you to work out each major design decision yourself instead of explaining the code to you.

On the first run it reads the git history and code, picks the 5 to 12 decisions that shape the project, and saves them to `.rederive/map.md` in the repo. Each session then takes one decision, describes the problem as it stood before the code existed, and asks questions that adapt to your answers until you reach the design. It shows the real commit at the end and asks you to explain the decision in your own words, which it saves to `.rederive/progress.md`.

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

During a session you can type `hint`, `reveal`, `skip`, `map` or `interview`.
