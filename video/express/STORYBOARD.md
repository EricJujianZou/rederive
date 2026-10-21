# rederive demo film: Express (storyboard, awaiting approval)

Same grid, stage, chat layer, intro and end card as the Linphone v2 storyboard (video/demo/STORYBOARD-v2.md). 16:9 only. 16 bars + 1 s tail = 33 s. The drawing is a request travelling from a browser into a server, and the design the user builds is where the login check lives.

| # | Bar | Time | Picture | Copy (verbatim) | Sound |
|---|---|---|---|---|---|
| 1 | 1 | 0:00-0:02 | White. The ∂ mark draws in. The product line types beneath it. | Learn any codebase by re-designing it yourself from first principles. | bed enters; one key per word |
| 2 | 2 | 0:02-0:04 | Composer rises; the user types the command and sends. | /rederive express | keys, send tap |
| 3 | 3 | 0:04-0:06 | Repo card lands, shrinks into the header pill. A browser window draws in on the left, a server box on the right with five route rows inside (GET /users, POST /login, GET /orders, PUT /cart, GET /me). | expressjs/express · fast, unopinionated web framework for Node.js · JavaScript / header: rederive · express | card land; the bed opens |
| 4 | 4 | 0:06-0:08 | "PROBLEM 1 OF 3" pops. Ring spins. The problem types. A request dot leaves the browser and waits at the server's edge. | Problem 1 of 3 / Every request must prove the user is logged in before its route runs. Where does that check live? | bed holds; keys; a rise into the question mark |
| 5 | 5 | 0:08-0:10 | The user types and sends. A small lock appears at the top of each of the five route rows. The request dot enters, meets a lock, passes, reaches its handler. | At the top of each route handler. | keys; the bed steps up a degree; one tick as the dot passes the lock |
| 6 | 6 | 0:10-0:12 | The route list scrolls to reveal forty rows. One row has no lock. The camera pushes 1.4x on it; it flashes red; a request dot slips straight through to its handler. "PROBLEM 2 OF 3". The constraint types. | Problem 2 of 3 / But here's the problem: there are forty routes. Miss one, and that route is open to everyone. | the stepped-up note drops out as the dot slips through; dull thud; bed flat |
| 7 | 7 | 0:12-0:14 | Camera eases back. The user types the second answer. | One function every request passes through before any route. | keys |
| 8 | 8 | 0:14-0:16 | Send. The forty locks lift out of their rows and merge into one gate box at the server's entrance. A request with a token passes the gate and reaches its route; one without a token bounces off. | gate label: auth | locks merge with one soft land; the bed steps up; tick on pass, dull tap on bounce |
| 9 | 9 | 0:16-0:18 | Three more boxes (log, parse body, rate limit) try to crowd into the same entrance and overlap the gate. "PROBLEM 3 OF 3". The second constraint types. | Problem 3 of 3 / That could work, but consider this new problem: logging, body parsing and rate limits each need that same spot. | the bed clutters (a detuned second voice); keys |
| 10 | 10 | 0:18-0:20 | The user types the third answer, with one pause, and sends. | Make it a list. Each function does its job, then calls the next. | keys; near-silence after send |
| 11 | 11 | 0:20-0:22 | The boxes line up in a row at the entrance: log → parse → auth → rate limit → route. A request dot steps through each with a tick and reaches its handler; the row turns green; one sweep. Camera pushes 1.3x. | | four ascending ticks, one per box, landing on the tonic: the chain is the melody |
| 12 | 12 | 0:22-0:24 | Giant "middleware" punches in, blur-swaps into the payoff bubble. "rederived" bold, "middleware chain" green. | You successfully rederived the middleware chain. Express does exactly this. | chime; bed sustains |
| 13 | 13 | 0:24-0:26 | Hold. Camera eases back. Drawing relaxes to mute. Iris seed on the avatar. | | breakdown |
| 14 | 14 | 0:26-0:28 | Iris into the end card. One ∂ grows to the lockup; wordmark locks. | rederive | music stops on the bar; one resolved note |
| 15-16 | 15-16 | 0:28-0:32 + tail | Tagline and URL; slow push. | Learn any codebase by re-designing it yourself from first principles. / github.com/EricJujianZou/rederive | tail |

Sound design follows the Linphone v2 storyboard: one bed in four states, a scale step per answer, flat under each constraint, earshot's bank for physical sounds and earshot's critique on every render.
