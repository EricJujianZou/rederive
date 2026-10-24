# What made four agent-skill repos take off

Key findings from the research brief "Viral Skill Teardown" (October 18, 2026,
https://claude.ai/artifact/DsPqrkejS8SGeDA6FFRarZ). The brief looked at how
taste-skill, mattpocock/skills, caveman, i-have-adhd, ponytail and archify grew,
which posts caused each jump, and what a creator with about 200 X followers can
copy. Star counts are as of October 18, 2026.

## The cases in one line each

- **taste-skill (Leon Lin, 98.7k stars).** He had posted AI demos on X daily for
  11 months and created the repo 47 minutes after one of his demos got 297k
  views. The launch tweet was plain text with a link. Stars grew about 200 a day
  for three months. The big jump came when he made v1.5 the default: the repo sat
  on GitHub Trending for 37 days and the rate went to 2,100 stars a day.
- **mattpocock/skills (Matt Pocock, 296k stars).** He started with about 170k
  YouTube subscribers and a 60k newsletter. His link-only tweet got 30k views.
  His video posts about single skills got over 200k. The breakout came 11 weeks
  in, the day after a two-hour workshop on someone else's 439k-subscriber
  channel, and the repo was #1 on Trending for three days after that.
- **caveman (113k stars).** A 19-year-old student with no X account built the
  skill the day after a 9.3k-upvote r/ClaudeAI post joked about making Claude
  talk like a caveman to save tokens. A stranger put it on the Hacker News front
  page the next day (904 points). About 6,600 stars in a few days.
- **i-have-adhd (57.7k stars).** One r/ClaudeAI post from the creator (63
  points), slow growth for four months, then a stranger's Hacker News submission
  (542 points) and four days at #1 on Trendshift.
- **ponytail (167k stars) and archify (85k stars).** Anonymous or near-anonymous
  creators. Both grew through GitHub Trending with no identifiable launch post.

## Where the claim came from

None of these repos had users when they made their claim. Each number was
something the author could produce alone in an afternoon.

| Repo | Claim | How it was produced |
|---|---|---|
| caveman | "75% less tokens" | The author measured his own sessions. JetBrains later measured 8.5%, and the dispute brought more press. |
| grill-me (mattpocock/skills) | "asked me 24 consecutive questions" | A count from one demo session, posted as a text tweet (88k views). |
| taste-skill | "247 sites studied" | A count of what went into building the skill. |

## What repeats across every case

1. **Someone else's post did the lifting.** Strangers submitted caveman,
   i-have-adhd and ponytail to Hacker News. Leon's biggest boosts were repost
   accounts and Trending. Matt's breakout came from another person's channel.
2. **GitHub Trending is the flywheel.** It appears after the first spike in every
   case, and repost accounts and foreign-language curators read it. Stars that
   arrive in one window are what put a repo there.
3. **A name you can say and a number you can argue with.** One or two words
   people can type in a reply, plus one measurable claim on the first screen of
   the README. People disputing the number is free distribution.
4. **Video beat links.** Matt's bare link got 30k views and his videos got over
   200k. Leon's spikes line up with without/with videos.
5. **Install is one line and free.** `npx skills add owner/repo`, a marketplace
   line, or a prompt to paste. No key, account or payment before the first
   visible result.
6. **Each version is a new launch.** Leon's v2 film gave him his best star days
   in a month. Matt ships a release every few weeks, each with a tweet and a
   video.
7. **They rode a wave that already existed.** caveman shipped a day after the
   meme. taste-skill followed a Gemini launch demo and framed itself against
   Anthropic's own frontend skill.
8. **The skill fed a product.** Leon launched TasteCode to the taste-skill
   audience. Matt's skills page sits with his courses and newsletter.

Hacker News did nothing for Matt (1, 2 and 43 points) but made caveman and
i-have-adhd. It works for strangers' submissions, not self-promotion.

## Playbook for a 200-follower account

Before launch:

1. Start from a conversation that already exists. Check the week's top
   r/ClaudeAI posts, the Hacker News front page and model-launch threads for a
   complaint or joke about agent behavior, and ship within a day or two.
2. Name it like a meme and back it with a number. One measurable claim and a
   before/after on the first screen of the README.
3. Make install one line and free.
4. Record a 30 to 60 second without/with video: same prompt, two results, side
   by side. Upload it natively everywhere.

Launch day:

5. Post everywhere on the same day: a short first-person text post with one
   screenshot on r/ClaudeAI, the X post with the video, and the Claude
   developer Discord. Never ask anyone for upvotes. Reddit and Hacker News both
   penalize it. The two Reddit cases in this study (the joke post behind
   caveman and the i-have-adhd creator's post) were text posts, so there is no
   evidence here for video on Reddit. The "video beat links" finding is from X.
   Skip a self-submitted Show HN: those scored 1, 2 and 43 points for Matt.

First month:

6. Send the video to accounts that repost trending repos (such as
   @GithubProjects) and to Chinese- and Spanish-language AI curators. Submit to
   awesome-agent-skills lists and skills.sh. Reply under big accounts' posts
   only when the video answers what they posted about.
7. Borrow an audience: offer a 10-minute demo or short workshop to a newsletter,
   podcast or YouTube channel in the Claude Code space.
8. Ship versions and post demos between them, each version with a new video.
   Post fast demos on model-release days.

## Where rederive stands against this

| Pattern | Status |
|---|---|
| One-word name | Done. |
| One-line free install | Done. `npx skills add EricJujianZou/rederive` installs into Claude Code, Codex, Cursor and 22 other agents. |
| Measurable claim on the first screen | Missing. Candidates: the number of questions it takes to rederive Express's middleware chain, or the time to the first design named on your own repo. Both come from one counted session. |
| Without/with video | In progress. The current brief (video/BRIEF-launch.md in the rederive-media repo) is a 28-second product film, not a side-by-side comparison. |
| Same-day launch on Reddit, HN, X and Discord | Not started. |
| Wave to ride | Not chosen. The nearest existing conversation is "I built it with AI and can't explain it in the interview." |
| Product behind the skill | None yet. |

## Caveats from the brief

- Tweet view and like counts are from October 18, 2026, not launch day.
- Reddit was mostly blocked to the research agents, so its role is probably
  undercounted.
- Two triggers are inferred from timing only: Leon's May 25 version bump and
  Matt's April 24 workshop.
- Leon's follower count at launch could not be found.
- The "857 stars on day one" story about Matt's repo is contradicted by the
  GitHub API. The repo was created February 3 and broke out April 25.
