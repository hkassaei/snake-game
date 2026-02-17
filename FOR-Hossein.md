# Snake Game - The Nokia Classic, Now in Your Browser

## What Is This?

Remember the Nokia 3310? That indestructible brick phone where you'd spend hours guiding a growing snake around a tiny green screen? This is *that* game, running right in your browser. No installs, no app store, no ads — just open a URL and play.

It started as a terminal app built with Go and tcell. Then we ported it to the web: same game, same feel, but now it runs anywhere with a browser. And now? It's deployed on Cloudflare's global edge network, so it loads instantly from wherever you are in the world.

## How to Play

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Open in your browser (Vite will print the URL, typically http://localhost:5173)
```

Or just open `public/index.html` directly in any browser — no server needed.

**Controls:**
- **Arrow keys** or **WASD** to move
- **P** or **Space** to pause
- **Enter** to start / restart
- **Escape** to return to menu

Pick your difficulty (Slug, Worm, or Python — each one faster than the last), survive the countdown, and eat as much food as you can. Every meal is worth 100 points. Hit a wall or bite yourself and it's game over.

## Technical Architecture

### The Big Picture

```
public/index.html  → The complete game: HTML + CSS + JavaScript + Canvas
public/test.html   → Regression tests that fetch and verify index.html
src/index.ts       → Hono app — serves static files on Cloudflare Pages
vite.config.ts     → Vite config wiring up Hono dev server + Cloudflare Pages build
package.json       → Dependencies and scripts
```

The game is 100% client-side JavaScript. The "backend" is just a static file server — but instead of Go's `net/http`, it's now a Hono app deployed as a Cloudflare Pages Function. In development, Vite serves everything with hot reloading. In production, Cloudflare's CDN serves the static files directly from edge nodes worldwide, and the Hono worker handles any routes that aren't static assets.

### Why We Moved from Go to Hono/Cloudflare

The Go server was 35 lines of `http.FileServer`. It worked great locally, but deploying it meant running a server somewhere — a VPS, a container, something with a process that stays alive. That's overkill for serving two HTML files.

Cloudflare Pages is *serverless static hosting*. You push your files, Cloudflare distributes them to 300+ data centers worldwide, and visitors get served from the nearest one. No servers to manage, no uptime to monitor, no scaling to worry about. The free tier is generous enough that a snake game will never come close to hitting limits.

Hono is a lightweight web framework designed for edge runtimes (Cloudflare Workers, Deno, Bun). It's like Express.js but built for the modern serverless world — tiny bundle size, TypeScript-first, and it runs on Cloudflare's V8 isolates instead of Node.js. For our use case (serve static files), the entire worker is under 19KB.

Think of it this way: the Go server was like renting an apartment just to store two boxes. Cloudflare Pages is like using a locker at the airport — you drop your stuff off and it's available everywhere, instantly.

### The Stack

| Tech | Role |
|------|------|
| **Hono** | Minimal web framework for Cloudflare Workers/Pages — handles routing |
| **Vite** | Dev server + build tool — provides fast HMR in development, bundles for production |
| **Cloudflare Pages** | Edge deployment platform — serves static files from 300+ global locations |
| **TypeScript** | Type-safe server code (just 8 lines, but still nice to have) |
| **HTML5 Canvas** | The game's drawing surface — pixel-level control for the board, snake, and UI |
| **Vanilla JavaScript** | The game itself — no framework needed for 350 lines of game logic |
| **localStorage** | Browser-native persistence for best scores — no backend needed |

### How Vite + Hono Work Together

This is worth understanding because it's a pattern you'll see in modern edge-deployed apps.

**In development** (`npm run dev`):
1. Vite starts a dev server
2. The `@hono/vite-dev-server` plugin loads your Hono app (`src/index.ts`)
3. Static files in `public/` are served directly by Vite
4. Any changes trigger instant hot module replacement

**In production** (`npm run build`):
1. Vite bundles `src/index.ts` into `dist/_worker.js` — the Cloudflare Pages Function
2. Static files from `public/` are copied into `dist/`
3. A `_routes.json` is generated that tells Cloudflare: "serve `index.html` and `test.html` directly from CDN; send everything else through the worker"

**On deploy** (`npm run deploy`):
1. `wrangler pages deploy dist` pushes everything to Cloudflare
2. Static assets go to Cloudflare's CDN
3. The worker runs on Cloudflare's edge — but for our pure-static site, it barely does anything

### Why a Single HTML File?

This was a deliberate choice. The game has zero build tools, zero npm packages, zero transpilation steps. Everything lives in one file: styles in a `<style>` tag, game logic in a `<script>` tag. Why?

- **Zero friction to deploy.** Drop the file anywhere — a web server, a USB stick, an email attachment — and it works.
- **Zero dependencies to break.** No `node_modules` folder with 847 packages for the game itself. (The server has dependencies, but the game doesn't.)
- **Easy to understand.** Open one file, read top to bottom, and you see the entire game. No jumping between 15 component files to understand how a menu works.

For a game this size (~350 lines of JS), splitting into multiple files would add complexity without adding clarity.

### Canvas Rendering

The game renders on an HTML5 `<canvas>` element. Think of Canvas as a blank bitmap you draw on with JavaScript — like MS Paint with a programming API. We use it for:

- **Filling rectangles** — the board, border, snake segments, and food are all rectangles
- **Drawing text** — scores, menu items, countdown numbers, overlays

The canvas auto-sizes based on the viewport. On a big monitor, cells are bigger. On a phone screen, they shrink. The `resize()` function recalculates everything when the window changes size.

Each grid cell maps to a `cellSize × cellSize` pixel square. The cell size is computed to fit the board in ~85% of the viewport while keeping things looking proportional.

### The Nokia Palette (Preserved!)

The same three color themes from the terminal version, with identical RGB values:

| Theme  | Background (Light) | Snake/Border (Dark) |
|--------|-------------------|-------------------|
| Green  | `#9bba5a` — the iconic Nokia LCD green | `#435224` — dark olive |
| Blue   | `#82aad2` — calm sky blue | `#1e375a` — navy |
| Orange | `#e6b464` — warm amber | `#78410f` — burnt sienna |

The food is drawn as a smaller centered square using the dark color — giving it a distinct dot-like appearance on the lighter background.

### State Machine (Same Design, New Language)

The game flows through the same five states as the Go version:

```
Menu  →  Countdown (3...2...1...GO!)  →  Playing  ⇄  Paused
                                            ↓
                                        Game Over  →  Menu or restart
```

Each state has its own render function and input handler. This pattern — one of the most useful in game development — keeps the code clean even as you add more states. Without it, you'd end up with a spaghetti mess of `if (isPlaying && !isPaused && !isGameOver)` checks everywhere.

### The Game Loop: setInterval vs requestAnimationFrame

A common question in browser game dev: should you use `requestAnimationFrame` (rAF) or `setInterval`?

We use `setInterval` — and here's why. Snake has a fixed tick rate (150ms for Slug, 100ms for Worm, 75ms for Python). The snake moves exactly once per tick. rAF fires at ~60fps (16ms), which is way too fast and would require you to manually track elapsed time and decide when to advance. `setInterval` at the exact difficulty interval gives us precisely the behavior we want: the snake moves at a steady, predictable rhythm.

rAF is better for smooth animations (character movement, scrolling, particles). `setInterval` is better for discrete, turn-based updates — which is exactly what Snake is.

### Best Score Persistence

The terminal version kept best scores in memory only — quit the game, lose your records. The web version uses `localStorage`, the browser's built-in key-value store. Best scores persist across sessions, per difficulty level. It's literally two lines:

```javascript
localStorage.setItem("snakeBestScores", JSON.stringify(bestScores));
const saved = JSON.parse(localStorage.getItem("snakeBestScores"));
```

No database, no server-side storage, no user accounts. `localStorage` is perfect for this: simple, synchronous, and persists until the user clears their browser data.

## Project Structure

```
snake-game/
├── public/
│   ├── index.html      # The game (100% client-side)
│   └── test.html       # Regression tests
├── src/
│   └── index.ts        # Hono app (8 lines — serves static files)
├── dist/               # Build output (git-ignored)
│   ├── _worker.js      # Cloudflare Pages Function
│   ├── _routes.json    # Route config (static vs worker)
│   ├── index.html      # Copied from public/
│   └── test.html       # Copied from public/
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript config
├── vite.config.ts      # Vite + Hono plugin config
└── FOR-Hossein.md      # You're reading it
```

## Lessons & Insights

### From Go to Hono: The Server That Almost Doesn't Exist

The Go server was 35 lines. The Hono app is 8 lines. But the real difference isn't line count — it's the *deployment model*. The Go server was a long-running process that needed to stay alive on a machine somewhere. The Hono worker is a *function* that Cloudflare runs on-demand at the edge. It boots in milliseconds, handles a request, and disappears. You don't think about servers, uptime, or scaling.

This is the serverless mental shift: you stop managing infrastructure and start just writing request handlers. For a static site like ours, this is practically free — Cloudflare serves the HTML directly from its CDN without even invoking the worker.

### The Vite/Hono/Cloudflare Pipeline

This is a modern pattern worth understanding:

1. **Vite** is the build tool and dev server. Think of it as the Swiss Army knife of frontend tooling — fast dev server with HMR, production bundler, plugin ecosystem.
2. **Hono** is the web framework that runs on the edge. It provides familiar Express-like routing but targeting Cloudflare Workers, Deno, and Bun instead of Node.js.
3. **Cloudflare Pages** is the deployment target. It hosts your static files on a global CDN and runs your worker functions at the edge.

The `@hono/vite-dev-server` plugin bridges Vite and Hono in development. The `@hono/vite-cloudflare-pages` plugin bridges them for production builds. Together, they give you a seamless workflow: `npm run dev` for local development, `npm run build` for production, `npm run deploy` to go live.

### Edge Computing: Why It Matters for a Snake Game (and Everything Else)

"But it's just a static HTML file — why do I need edge computing?" Fair question. For our snake game, edge deployment means:

- **Instant loading worldwide.** A player in Tokyo gets the game from Cloudflare's Tokyo data center, not from a server in Virginia. The difference is 20ms vs 200ms.
- **Zero server management.** No EC2 instances, no Docker containers, no process managers. Push your code, it's live.
- **Free for small projects.** Cloudflare Pages' free tier gives you 500 builds/month and unlimited bandwidth.

But the real lesson is the *pattern*. Once you understand Hono + Cloudflare Pages, you can build full-stack apps with API routes, database connections, authentication — all running at the edge. The snake game is just the starting point.

### The Reverse Death Bug (Still Relevant)

Same bug, same fix, different language. If the snake is moving right and you press left, it shouldn't instantly die by reversing into itself. The fix:

```javascript
const opposites = { [UP]: DOWN, [DOWN]: UP, [LEFT]: RIGHT, [RIGHT]: LEFT };
if (opposites[d] !== dir) nextDir = d;
```

We set `nextDir` (not `dir`) so the actual direction change happens at the start of the next tick. This prevents rapid key presses between ticks from bypassing the check.

### Canvas Sizing: The Responsive Game Board

Terminal games don't need responsive design — the terminal is whatever size it is, and you center the board. Browser games do. Our approach:

1. Calculate the maximum cell size that lets the board fit in ~85% of the viewport
2. Set a minimum of 8px per cell (so it doesn't become invisible on tiny screens)
3. Recalculate everything on `window.resize`

The key insight: **size everything relative to `cellSize`**, including font sizes. This way, the entire game scales uniformly. Text doesn't suddenly look tiny or huge relative to the board.

### The Evolution of This Project

```
Terminal Go app (tcell)  →  Web app (Go server + Canvas)  →  Edge-deployed (Hono + Cloudflare)
     ~580 lines                  ~350 lines JS + 35 Go            ~350 lines JS + 8 TS
```

Each migration preserved the game logic and changed only the delivery mechanism. That's the hallmark of good architecture: the core stays stable while the shell adapts to new platforms. If we wanted to deploy on AWS Lambda, Deno Deploy, or Bun next, we'd change the server adapter and the deploy command — the game wouldn't know the difference.
