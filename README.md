# rederive

rederive is a skill for Claude Code and other coding agents that teaches you a codebase by having you design it yourself. It reads the repo's history and code, finds the design decisions that shaped it, and turns each one into a problem for you to solve. You start from the problem the project was built for. The tutor adds the real constraints one at a time until your design matches the original or improves on it.

It works on your own projects and on any open source repo. Use it on a project you built with an AI agent and can't yet explain, before an interview where you have to walk through a project, or to learn how a well-known project like Express or Redis was designed.

## Example

An example of the start of a session on Express:

```
> /rederive https://github.com/expressjs/express

Finding the most challenging problems and rearranging them into logic chains. This will take a few mins

We have this problem: Node gives you one function that receives every HTTP request. You want to
build web apps where logging, parsing and auth are written once and reused. How would you solve it?

> one big handler with if statements for each url

With 40 routes that each need auth, your handler repeats the auth check 40 times, and one missed
check is a security hole. How would you change it?

> put auth in a function and have every route call it first

Now a team wants to add rate limiting before auth on some routes and not others. How does your
design handle that?

> make a list of functions per route and run them in order, each one decides whether to continue

Yes, exactly, that's how a middleware chain works, you rederived it! It's a list of functions that
each handle a request and pass it to the next one.
```

## Install

Claude Code:

```
/plugin marketplace add EricJujianZou/rederive
/plugin install rederive@rederive
```

Other agents that load `SKILL.md` skills can use the `skills/rederive` folder. Copy it into the folder your agent loads skills from.

```
git clone https://github.com/EricJujianZou/rederive
```

It needs `git`, `bash` and `python3`.

## Use

```
/rederive                                      # the repo you are in
/rederive ~/code/myapp                         # a local repo
/rederive https://github.com/expressjs/express # clones it into the current folder
```

Talk to it in plain words. You can say you're stuck, ask for a hint, skip a problem or say you want to start over. It never tells you the answer. When you are stuck it narrows the problem down to a few approaches for you to choose from. After two wrong answers in a row it offers to draw a sketch of the problem.

## How it works

The first session on a repo starts with why the project exists. On your own repo it asks you why you built it. On someone else's repo it works out the original problem from the README and the early commits and asks you how you would solve it.

While you answer, a background agent builds a decision map in `.rederive/map.md`. It reads the code and the import links between files, and uses the commit history to find when the design changed. It does not rely on commit messages, so it also works on repos with a few large commits or poor messages, which is common for projects built with AI. The map holds 5 to 10 problems in the order the system would be built, each with its constraints and the real design. The map contains the answers, so don't open it until you're done.

The tutor writes notes to `.rederive/log.md` after each problem, covering where you struggled and what you worked out without help. At the end it tells you where the log is so you can look for patterns in what to practice.

Both files stay on your machine. The `.rederive/` folder is added to the repo's local git exclude list, so it never appears in your commits. rederive sends no telemetry.

## License

MIT
