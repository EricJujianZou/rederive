# Wednesday launch, October 28, 2026

Everything below is drafted so the morning takes about 30 minutes. Times are
Eastern. All posts go out in one window so the stars arrive together, which is
what puts a repo on GitHub Trending.

## Before Wednesday

- Upload the 40k reel to the devbox so the "comment for the repo" ending can be
  trimmed off. Reddit treats that ending as engagement farming and the link goes
  in the post itself.
- Decide the measurable claim for the first screen of the README (see
  `viral-skill-findings.md`, "Where rederive stands against this").

## 9:00 Reddit, r/ClaudeAI

Post type: video, uploaded natively (not an Instagram or TikTok link). Flair:
whichever of "Built with Claude" or "Showcase" the flair menu offers. Do not
ask for upvotes anywhere.

Title (pick one):

I made a skill that teaches you your own vibecoded project by making you re-derive its design decisions

If you built your project with Claude and can't explain it yet, this skill makes you re-design it yourself before it shows you the code

First comment, posted right after the video:

Repo: https://github.com/EricJujianZou/rederive

Install in Claude Code, Codex, Cursor and about 22 other agents:

    npx skills add EricJujianZou/rederive

How it works: it reads the repo, finds the decisions that shaped the code (why the middleware runs as a chain, why state lives where it does) and gives each one to you as a problem before it shows you what the code did. You answer, it compares your answer with the real design, and moves on to the next decision. It works on your own repo or on open source repos like Express and Redis.

[Your reason for building it, in one or two sentences.]

122 stars so far from two reels. I'd like to know where it breaks on your repos.

## 9:15 X update

Attach the trimmed reel or the Express demo film.

rederive got to 122 stars in 5 days. It's a skill for coding agents that teaches you a codebase you built with AI by making you re-design it yourself, one decision at a time. Works in Claude Code, Codex, Cursor and 22 more.

npx skills add EricJujianZou/rederive

## 9:30 Curator messages

Send to @GithubProjects and to two or three Chinese- and Spanish-language AI
curators on X. Find curators by looking at who quote-posted taste-skill or
mattpocock/skills in those languages. Same text for each, English is fine,
they translate.

Hi, I made rederive, a skill for coding agents that teaches you a codebase by making you re-design it yourself. 122 stars in its first 5 days, 25 agents supported with one install line. Repo: https://github.com/EricJujianZou/rederive. Short demo attached if it fits your feed.

## 9:45 Lists

- Open a pull request adding rederive to the awesome-agent-skills list (one
  line: name, link, one-sentence description from the README).
- Check that the repo appears on skills.sh. It indexes repos installed through
  `npx skills add`, so it may already be there.

## Skip

- Show HN. Self-submitted posts scored 1, 2 and 43 points in the study.
- Discord. Already shared there, posting again reads as spam.

## Through the day

Reply to every Reddit comment within the hour. Comments are what keep a post
on the subreddit's front page. If someone reports the skill breaking on their
repo, fix it the same day and reply with the commit.
