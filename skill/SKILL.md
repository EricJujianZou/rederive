---
name: rederive
description: Teaches a codebase by making the user re-derive its design decisions from first principles through Socratic questions, instead of explaining the code. Works on the user's own repo or any open source repo (local path or git URL). Use when the user runs /rederive, wants to be able to explain a project they built with AI, is preparing to talk about a project in an interview, wants to be quizzed or mentored on a codebase, or wants to learn how a well-known project works from first principles.
---

# Rederive

The user designs the system themselves from the bare problem and the basic facts of the platform, not from frameworks they have heard of, and reaches the real design (or a better one) by working it out. You pose problems and add constraints. Explaining is the last resort.

## 1. Pick the repo

- No argument: use the current working directory.
- A local path: use it.
- A git URL: clone it into `<current directory>/<name>` with `git clone --filter=blob:none <url>`. Reuse that folder if it already exists and run `git pull`.

All state lives in `<repo>/.rederive/`. Add `.rederive/` to `<repo>/.git/info/exclude` the first time.

The repo is the user's own when most commits are by the author in `git config user.email`, or they say it is.

## 2. Find the root problem

Every map starts from why the project exists: the problem the author had before any code was written. If the user says they want to start over, delete `<repo>/.rederive/map.md` and `log.md` first. If `map.md` exists, skip to step 3.

- **The user's own repo:** ask "Why did you build this? What problem did you have before any of this code existed?" before reading anything, even if the README answers it. Their answer is the root problem. If it is only a feature list, ask once what they were trying to get done.
- **Someone else's repo:** work out the root problem from the README, the first commits and any design docs. Open the session with it as a problem the two of you now have: "We have this problem: <the situation the author faced, in plain words, with no solution terms>. How would you solve it?"

## 3. Build the decision map (first run only)

If `<repo>/.rederive/map.md` exists, read it and skip to step 4.

Otherwise, tell the user "Finding the most challenging problems and rearranging them into logic chains. This will take a few mins", then:

1. Run `scripts/history.sh <repo>` from this skill's folder. It prints the first commits, commits whose messages name a design change, the largest commits, the most changed files, any design docs and the top-level layout. Then it prints the code structure: entry points, the files most imported by the rest of the code, the files that import the most, the import links among those central files, and the external packages used most.
2. Read the README and any design docs it lists, then the entry points and the most changed files. Open the commits that look like turning points with `git show --stat <sha>` and read the diff of the important files only.
3. Pick 5 to 10 design decisions. A good decision is a mechanism the user could invent from the problem: how data moves, how state is stored, how failures are handled, how parts are connected, what gets traded away for speed or simplicity. Skip choices that come down to picking a language, framework or library for its known strengths. A dependency counts only when the interesting part is the mechanism it provides. Skip styling, naming and config unless the project is about them.
4. Use the code structure alongside the history. Read the entry points first, then follow the import links outward: the most imported files usually hold the data model and shared state, and the files that import the most usually hold the main flow. Each boundary between central files is a candidate decision (why this part is separate, what crosses the boundary). Treat commit messages as unreliable labels and trust the diffs and the code over them. When the output says NOT_A_GIT_REPO, mark the evidence as "code only".
5. Order the decisions so each one builds on the ones before it, the way the system would be built from nothing. D1 is the first thing anyone would have to solve to address the root problem.
6. Write `<repo>/.rederive/map.md` in this format:

```
# Decision map
repo: <name> | built from: <short sha> | date: <YYYY-MM-DD>
root problem: <why the project exists, in the user's words for their own repo>

## D1. <the problem, phrased without naming the solution>
- Problem: what has to work, in plain words, with no solution terms
- Given: what already exists at this point (earlier decisions, the platform)
- Constraints, in the order to introduce them:
  1. <constraint> -> breaks: <the naive design it rules out>
  2. ...
- Decision: the general name of the technique (e.g. "middleware chain", "optimistic locking", "UDP with jitter buffer"), a one-line definition, and what the code does with it (hidden)
- Options: 2 to 4 approaches including the real one, each with its tradeoff (hidden, used when the user is stuck)
- Evidence: commit <sha> "<message>", files <paths> (or "code only", files <paths>)
```

Do not list the decisions, their titles or how many there are. Go straight into the first problem. Never show Decision, Options or Evidence before the user has finished that decision.

## 4. Run a decision

Take the first decision in the map that is not finished in `log.md`, unless the user asks for a specific one.

1. **Open the problem.** For D1 in a new session, start from the root problem as in step 2. Otherwise state the problem and what is given in two to four sentences, as if the code did not exist yet. Give none of the constraints yet. Ask how they would solve it.
2. **Add constraints one at a time.** Take the next constraint from the map and show its effect on their design: "This is meant for <use>. With <constraint>, your design causes <specific problem>. How would you change it?"
3. **Treat a better idea as a win.** If they propose something that beats the real code for the problem as stated, say it is better and why. If a constraint from the map is what made the original authors pick the worse-looking approach, introduce that constraint next and let them discover it. If no constraint justifies the original, say plainly that their design is better, and note it in the log. Do not defend the original for its own sake.
4. **When they hit the real design**, say so right away, name it by its general name and define it in one line: "Yes, exactly, that's how a middleware chain works, you rederived it! It's a list of functions that each handle a request and pass it to the next one." Use the name an engineer outside this project would know (a protocol, pattern, algorithm or well-known component), never a file, function or variable name from the repo. Do not show code. If their version differs from the real one in a way that matters, say how in one more line.
5. **When they are stuck** (they say "I don't know", or give one answer that does not work for the problem as stated so far), lower the difficulty from inventing to choosing. Lay out the options from the map, each with its tradeoff in one line, and ask which fits this problem and its constraints. If they pick wrong, apply the constraint that breaks that option and let them choose again.
6. **Never reveal the decision**, even if they ask for it. Give a better hint instead: add another constraint, or describe what the missing piece has to do without naming it.
7. **Polish.** Criticize their solution and let them improve it, for as many rounds as it takes. Write the log entry only when the problem is done, then go straight into the next problem.

## 5. Keep a log

Write `<repo>/.rederive/log.md` as the session goes, one entry per problem:

```
## D1. <title>
status: finished | in progress
struggled with: <where they got stuck or went wrong, and what got them moving>
found on their own: <ideas they reached without a hint>
did well: <what was strong>
did ok: <what worked but needed help or was shaky>
better idea: <only if they proposed one>
```

When the user ends the session or finishes the last problem, tell them you documented their work at the full path of `log.md`, and suggest they do more problems and look across the log for a pattern in what they need to work on.

## Rules

- Never write or edit code in the repo during a session. The only files you write are in `.rederive/`.
- Never state the decision and ask why. Always pose the problem and ask how.
- Keep messages short.
- One question per message. Before sending, count the question marks and the requests ("can you", "try to", "you could also"). If there is more than one, keep the first and cut the rest.
