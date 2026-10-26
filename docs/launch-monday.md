# Monday launch, October 26, 2026

Everything below is drafted so the morning takes about 30 minutes. Times are
Eastern. All posts go out in one window so the stars arrive together, which is
what puts a repo on GitHub Trending.

## Before Monday

- Upload the 40k reel to the devbox so the "comment for the repo" ending can be
  trimmed off. Reddit treats that ending as engagement farming and the link goes
  in the post itself.
- Decide the measurable claim for the first screen of the README (see
  `viral-skill-findings.md`, "Where rederive stands against this").

## Now: Reddit, r/ClaudeAI

Post type: text post with one screenshot of a rederive session (the skill
asking a design question). The reel goes to X only. The viral-skill study
found no evidence for video on Reddit, and both Reddit examples in it were
text posts. Flair: "Built with Claude" or "Showcase". Do not ask for upvotes.

Rules to meet (Rule 7, read through ThreadFox, not checked live): say in detail
how Claude helped build it, say it is free, keep promotional language low, no
referral links. Posting needs more than 100 karma and may be limited to
approved users, so check that the post appears in /new after posting.

Title:

I made a skill that teaches you your own vibecoded project by making you re-derive its design decisions

Body:

I built rederive because I'm afraid that developers will become meat proxies. I use it because I genuinely find it to be the most fun way of learning: solving problems and being creative about something I am passionate about. It beats memorizing what an agent says or coding problems by a mile.

What it does: it reads a repo, finds the decisions that shaped the code (why the middleware runs as a chain, why state lives where it does) and gives each one to you as a problem before it shows you what the code did. You answer, it compares your answer with the real design, and moves on to the next decision. It works on your own repo or on open source repos like Express and Redis.

How Claude helped: I built it in Claude Code over the last 8 days, and 75 of its 76 commits were written with Claude. The skill also runs on Claude: Claude reads the repo, picks the decisions and asks the questions. Most of my work was testing sessions on real repos and cutting questions that gave the answer away.

It's free and MIT licensed. Install in Claude Code, Codex, Cursor and about 22 other agents:

    npx skills add EricJujianZou/rederive

Repo: https://github.com/EricJujianZou/rederive

263 stars so far. I'd like to know where it breaks on your repos.

## Later: r/vibecoding, after mod approval

Dev tools need mod approval first, asked through the subreddit's X community
(ThreadFox reading of the rules, not checked live). After approval you get one
intro post. Use the "here's the project, here's how I made it" frame and adapt
the r/ClaudeAI body. Do not post before approval.

## 10:15 X update

Attach the trimmed reel or the Express demo film.

rederive got to 263 stars in 8 days. It's a skill for coding agents that teaches you a codebase you built with AI by making you re-design it yourself, one decision at a time. Works in Claude Code, Codex, Cursor and 22 more.

npx skills add EricJujianZou/rederive

## 10:30 Curator messages

Send to @GithubProjects and to two or three Chinese- and Spanish-language AI
curators on X. Find curators by looking at who quote-posted taste-skill or
mattpocock/skills in those languages. Same text for each, English is fine,
they translate.

Hi, I made rederive, a skill for coding agents that teaches you a codebase by making you re-design it yourself. 263 stars in 8 days, 25 agents supported with one install line. Repo: https://github.com/EricJujianZou/rederive. Short demo attached if it fits your feed.

## 10:45 Lists

- Open a pull request adding rederive to the awesome-agent-skills list (one
  line: name, link, one-sentence description from the README).
- Check that the repo appears on skills.sh. It indexes repos installed through
  `npx skills add`, so it may already be there.

## Skip

- Show HN. Self-submitted posts scored 1, 2 and 43 points in the study.
- Discord. Already shared there, posting again reads as spam.
- r/cursor. Self-promotion posts are likely removed there (ThreadFox reading of
  the rules) and the subreddit caps self-promotion at 10% of your activity.

## Through the day

Reply to every Reddit comment within the hour. Comments are what keep a post
on the subreddit's front page. If someone reports the skill breaking on their
repo, fix it the same day and reply with the commit.
