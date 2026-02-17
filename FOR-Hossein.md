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
2. A custom Vite plugin rewrites `/` to `/index.html` so the root URL works
3. Static files in `public/` are served directly by Vite (the Hono app is never invoked in dev)
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

The `@hono/vite-cloudflare-pages` plugin bridges Vite and Hono for production builds — it bundles the Hono app into a Cloudflare Pages worker. In development, a simple custom Vite plugin handles static file serving directly, bypassing Hono entirely (more on why in the deployment section below). Together, this gives you a seamless workflow: `npm run dev` for local development, `npm run build` for production, `npm run deploy` to go live.

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

### Deploying to Cloudflare: A Comedy of Errors

Getting the game running locally was the easy part. Getting it deployed to Cloudflare Pages? That was a four-bug gauntlet. Each fix revealed the next problem, like peeling an onion. Here's the full story — because deployment bugs teach you more about how a platform *actually* works than any tutorial ever will.

#### Bug #1: `env.ASSETS` Is Undefined (Dev Server Crash)

The first version of `src/index.ts` used `serveStatic` from `hono/cloudflare-pages`:

```ts
import { serveStatic } from 'hono/cloudflare-pages'
app.get('/*', serveStatic())
```

Ran `npm run dev`, hit `localhost:5173`, and immediately:

```
TypeError: Cannot read properties of undefined (reading 'fetch')
    at handler.js:56:34
```

**What happened:** `serveStatic` from `hono/cloudflare-pages` calls `env.ASSETS.fetch()` internally. `ASSETS` is a special binding that Cloudflare injects at runtime — it's the service that fetches your static files from Cloudflare's CDN. But in the Vite dev server, there *is* no Cloudflare environment. `env.ASSETS` is `undefined`, so calling `.fetch()` on it blows up.

**The lesson:** Cloudflare-specific APIs only exist on Cloudflare. Sounds obvious, but it's easy to forget when you're building for a platform you're not running on yet. The `@hono/vite-dev-server` plugin with its Cloudflare adapter *partially* emulates the Cloudflare environment, but it doesn't provide the `ASSETS` binding. This is a gap in the tooling.

#### Bug #2: Removing `serveStatic` Causes 404 in Dev

"Fine," we said, "the dev server doesn't need `serveStatic` — Vite serves `public/` files on its own." We removed `serveStatic`, leaving an empty Hono app:

```ts
const app = new Hono()
export default app
```

Refreshed the browser: **404 Not Found**.

**What happened:** The `@hono/vite-dev-server` plugin was intercepting *every* request and routing it through the Hono app. The Hono app had no routes, so it returned 404. The plugin saw a valid HTTP response (status 404) and returned it to the browser — it never fell through to Vite's static file middleware.

**The fix:** We ripped out `@hono/vite-dev-server` entirely. We don't have any API routes — why run requests through Hono in dev at all? Instead, we wrote a tiny 10-line Vite plugin:

```ts
function servePublicIndex(): Plugin {
  return {
    name: 'serve-public-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/') {
          req.url = '/index.html'
        }
        next()
      })
    },
  }
}
```

This rewrites `/` to `/index.html`, and Vite's built-in static file serving picks up `public/index.html`. Simple, no dependencies, works perfectly.

**The lesson:** Sometimes the right move is to *remove* a tool, not configure it differently. We had a plugin whose entire job was to pass requests to Hono — but Hono had nothing to do with them. Removing the middleman was cleaner than teaching the middleman to step aside. Don't keep dependencies you don't need; every dependency is a surface area for bugs.

#### Bug #3: Build Plugin Looks for `index.tsx`, Not `index.ts`

Ran `npm run build` — success. Ran `npm run deploy` — uploaded files, compiled worker... then:

```
Failed to publish your Function. Got error: Uncaught Error:
Can't import modules from ['/src/index.tsx', '/app/server.ts']
```

**What happened:** The `@hono/vite-cloudflare-pages` build plugin generates a wrapper (`_worker.js`) that tries to import your Hono app. By default, it looks for `/src/index.tsx` or `/app/server.ts`. Our file was `/src/index.ts` (`.ts`, not `.tsx`). The generated wrapper couldn't find the import, so it threw an error at runtime on Cloudflare.

**The fix:** One line — pass the explicit entry point to the build plugin:

```ts
build({ entry: 'src/index.ts' })
```

**The lesson:** Default conventions are great until they don't match your project. The plugin assumed a React-style `.tsx` entry point because most Hono apps use JSX for HTML templating. Ours doesn't — it serves static files. Always check what a build tool *assumes* about your project structure, especially when things work locally (Vite doesn't care about the extension) but fail in production (the generated Cloudflare wrapper does).

#### Bug #4: Production 500 Error (The Root Route Gap)

Build succeeded. Deploy succeeded. Opened the production URL: **500 Internal Server Error**.

**What happened:** This one's subtle. The build generates a `_routes.json` file:

```json
{"version":1, "include":["/*"], "exclude":["/index.html","/test.html"]}
```

This tells Cloudflare: "serve `/index.html` and `/test.html` directly from CDN (fast, no worker needed). Route *everything else* through the worker." The problem? `/` (the root URL) is *not* `/index.html`. It's a different route. So when someone visits `snake-game-3j3.pages.dev`, the request goes to the worker. But we'd removed `serveStatic` from the worker back in Bug #1! The empty Hono app had no idea what to do with `/`, and Cloudflare returned a 500.

**The fix:** Add `serveStatic` *back* to the Hono app:

```ts
import { serveStatic } from 'hono/cloudflare-pages'
app.get('/*', serveStatic())
```

"Wait — didn't that crash the dev server?" Yes! But now the dev server doesn't *use* the Hono app. The custom Vite plugin handles everything in dev. The Hono app with `serveStatic` only runs in production on Cloudflare, where `env.ASSETS` actually exists. Dev and production follow different code paths, and that's perfectly fine.

**The lesson:** Dev and production are *different environments*. It's tempting to want identical behavior in both, but sometimes that's not possible — and forcing it creates worse bugs. The mature approach: understand what each environment provides, and architect accordingly. In dev, Vite serves files. In production, Cloudflare's ASSETS binding serves files. Same result, different mechanisms.

#### The Meta-Lesson: Dev/Prod Parity Is a Spectrum

These four bugs all stem from one tension: **the Cloudflare runtime doesn't exist on your laptop.** You're building for a platform (V8 isolates at the edge) that you can only *simulate* locally. The simulation is good but imperfect. Cloudflare-specific APIs like `env.ASSETS` don't exist in Node.js. The `_routes.json` routing logic doesn't run in Vite. Default file conventions differ between tools.

This isn't unique to Cloudflare. It happens with AWS Lambda, Vercel Edge Functions, Deno Deploy — any serverless platform. The local dev experience is always an *approximation* of production. The key skills:

1. **Read error messages carefully.** `Cannot read properties of undefined (reading 'fetch')` tells you exactly what's missing — something is `undefined` that shouldn't be.
2. **Understand the request lifecycle.** Who handles the request first? What happens when they can't handle it? Where does it fall through to? In our case: plugin → Hono → Vite → browser. Knowing this chain lets you diagnose where things go wrong.
3. **Test in production early.** Don't build for weeks and deploy once. Deploy after every meaningful change. We found the production 500 immediately because we deployed right after the build worked.
4. **Accept that dev ≠ prod.** Instead of fighting it, design for it. Our `vite.config.ts` uses a custom plugin for dev. Our `src/index.ts` uses Cloudflare APIs for production. Both work. Neither pretends to be the other.

### The Evolution of This Project

```
Terminal Go app (tcell)  →  Web app (Go server + Canvas)  →  Edge-deployed (Hono + Cloudflare)
     ~580 lines                  ~350 lines JS + 35 Go            ~350 lines JS + 8 TS
```

Each migration preserved the game logic and changed only the delivery mechanism. That's the hallmark of good architecture: the core stays stable while the shell adapts to new platforms. If we wanted to deploy on AWS Lambda, Deno Deploy, or Bun next, we'd change the server adapter and the deploy command — the game wouldn't know the difference.
