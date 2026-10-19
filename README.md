<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.png" />
    <img src="assets/banner-light.png" alt="rederive: learn any codebase by re-designing it yourself from first principles" width="100%" />
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-24292f?style=flat" alt="MIT License" /></a>
  &nbsp;
  <a href="https://agentskills.io"><img src="https://img.shields.io/badge/Agent_Skills-compatible-24292f?style=flat" alt="Agent Skills compatible" /></a>
  &nbsp;
  <a href="#install"><img src="https://img.shields.io/badge/Claude_Code-plugin-24292f?style=flat" alt="Claude Code plugin" /></a>
  &nbsp;
  <a href="#other-agents"><img src="https://img.shields.io/badge/Codex_%2F_Cursor_%2F_Gemini-install-24292f?style=flat" alt="Codex, Cursor, Gemini CLI" /></a>
</p>

<p align="center"><sub><a href="#a-session">A session</a> · <a href="#install">Install</a> · <a href="#how-it-works">How it works</a> · <a href="#license">License</a></sub></p>

**rederive** is a skill for coding agents that teaches you a codebase by making you design it yourself. It finds the decisions that shaped the code and gives each one to you as a problem to solve, with the real constraints added one at a time. It never tells you the answer.

Use it on a project you built with AI and can't explain yet, before an interview where you walk through your own work, or on a famous repo like Express or Redis.

## A session

The start of a session on Express (an example, shortened):

```
> /rederive https://github.com/expressjs/express

We have this problem: Node gives you one function that receives every HTTP request. You want
logging, parsing and auth written once and reused. How would you solve it?

> one big handler with if statements for each url

With 40 routes that each need auth, your handler repeats the auth check 40 times, and one missed
check is a security hole. How would you change it?

> put auth in a function and have every route call it first

Now some routes need rate limiting before auth and others don't. How does your design handle that?

> give each route a list of functions that run in order, each one decides whether to continue

Yes, exactly, that's how a middleware chain works, you rederived it! It's a list of functions that
each handle a request and pass it to the next one.
```

## Install

### Claude Code

```
/plugin marketplace add EricJujianZou/rederive
/plugin install rederive@rederive
```

### Other agents

Codex, Cursor, Gemini CLI, GitHub Copilot, opencode, Amp and Goose all read the shared `.agents/skills/` folder, so one command covers them:

```
npx skills add EricJujianZou/rederive
```

<details>
<summary>Install by hand</summary>

Clone the repo and copy `skills/rederive` into your agent's skills folder.

```
git clone https://github.com/EricJujianZou/rederive
cp -r rederive/skills/rederive ~/.agents/skills/
```

| Agent | One project | Every project |
|---|---|---|
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Cursor | `.cursor/skills/` | `~/.cursor/skills/` |
| Gemini CLI | `.gemini/skills/` | `~/.gemini/skills/` |
| GitHub Copilot | `.github/skills/` | `~/.copilot/skills/` |
| opencode | `.opencode/skills/` | `~/.config/opencode/skills/` |
| Windsurf | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| Amp | `.agents/skills/` | `~/.config/amp/skills/` |
| Goose | `.agents/skills/` | `~/.agents/skills/` |

</details>

It needs `git`, `bash` and `python3`.

## Use

```
/rederive                                       # the repo you are in
/rederive ~/code/myapp                          # a local repo
/rederive https://github.com/expressjs/express  # clones it into the current folder
```

Talk to it in plain words. Tell it you're stuck, ask to skip a problem, or say you want to start over.

## How it works

- **It starts from why the project exists.** On your own repo it asks you why you built it. On someone else's repo it works out the original problem and asks how you would solve it.
- **A background agent maps the repo while you answer.** It reads the code, the import links between files and the commits where the design changed. It doesn't trust commit messages, so repos built with AI in a few big commits work too.
- **The map holds 5 to 10 problems** in the order the system would be built, each with its constraints and the real design. It lives in `.rederive/map.md`. Don't open it until you're done, because it has the answers.
- **When you're stuck,** it narrows the problem to a few approaches to choose from. After two wrong answers in a row it offers to sketch the problem for you.
- **It keeps notes on how you did** in `.rederive/log.md`: where you struggled and what you worked out alone. Read it at the end to see what to practice.

Everything stays on your machine. `.rederive/` goes in the repo's local git exclude list, so it never shows up in your commits. rederive sends no telemetry.

## License

MIT
