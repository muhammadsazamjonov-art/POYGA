# REDLINE

A complete, single-player 3D street-racing browser game. Built with React, TypeScript, Three.js, and cannon-es (the maintained ES-module version of Cannon.js).

## Run Locally

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. No API keys, backend, or accounts are needed.

```sh
npx tsc --noEmit
npm run build
npm run preview
```

## The Game

- Three complete circuits: Tokyo Afterdark, Neon Harbor, and Midnight Pass.
- Configurable fields of 1-30 AI opponents, three difficulty levels, and 1-3 laps.
- AI anticipates corners, manages speed, avoids traffic, and changes lanes to pass.
- Cannon rigid-body chassis collisions, accumulated damage, impact sparks, camera shake, and destructible bodywork. Major impacts launch panels and wheels as independent rigid bodies.
- Tight arcade driving with optional auto-acceleration and corner assistance. The handling is intentionally accessible, not a tire or suspension engineering simulator.
- Nitro, handbrake drifts, camera switching, synthesized engine audio, instant restart, and track recovery.
- 216 individually named fictional car configurations across 18 model families, 12 trims, six body silhouettes, four performance classes, colors, and distinct driving stats. These are procedural vehicles, not 216 licensed or hand-modeled real-world cars.
- A free Vortex GT starts every new profile. Owned cars are never permanently lost in a crash.
- Credits are awarded **only for first place**. All other results and wrecks award zero credits. Purchased cars are deducted from the wallet and immediately equipped.
- A local top-50 high-score table, persistent garage, wins, preferences, and driver name.
- Responsive desktop and multi-touch controls, pause on focus loss, and reduced-motion support in the UI.

### Controls

| Input | Action |
| --- | --- |
| W / Up | Accelerate |
| A, D / Left, Right | Steer |
| S / Down | Brake |
| Shift | Nitro boost |
| Space | Handbrake / drift |
| F | Recover to the circuit, minus 200 points |
| C | Change chase camera |
| Escape / P | Pause or resume |
| R | Instantly restart |
| M | Toggle audio |
| Enter in the hub | Quick race |

On touchscreens, hold the steering arrows and the boost, gas, or brake pedals. Multiple fingers are supported. Landscape orientation gives the largest view. Auto-acceleration is enabled by default and can be disabled in Settings.

### Scoring and Economy

Distance and speed earn race points. Boosting and controlled drifting increase the score; passing earns 250 points and completing a lap earns 1,000. Impacts and recovery deduct points. A completed race earns 1,500 additional points, or 5,000 for a win.

The first-place prize is `(1200 + opponents * 160 + laps * 400) * difficultyMultiplier`, rounded to a whole credit. Multipliers: Rookie 0.8, Professional 1.0, Elite 1.5. The lobby shows the exact prize before starting.

Progress is stored under `redline-profile-v1` in localStorage. It is local to a browser and origin, not a cloud account. This client-only economy is not tamper-proof and is not intended for competitive multiplayer or real money. Storage failures are reported in the hub, and the current session remains playable.

## Create a New GitHub Repository

The source is ready for a new repository. Creating a remote repo requires your GitHub authentication. With the GitHub CLI installed:

```sh
gh auth login
# If this folder is not yet a Git repository:
git init -b main
git add .
git commit -m "Build REDLINE 3D racing game"
gh repo create redline-racing --public --source=. --remote=origin --push
```

Alternatively, create an empty repository on github.com and follow its existing-repository push instructions. No remote repository or hosted deployment is created without your account access.

## Deploy to Render

1. Push this project to your GitHub repository.
2. In Render, choose **New > Blueprint** and connect the repository.
3. Render reads the included `render.yaml` and creates a static site.
4. Confirm the service name and deploy. Future pushes to your connected branch can auto-deploy.

For manual setup, choose **Static Site**, use `npm ci && npx tsc --noEmit && npm run build` as the build command, and `dist` as the publish directory. Add the rewrite `/*` to `/index.html`. No environment secrets are required.

The included GitHub Actions workflow checks TypeScript, audits production dependencies, builds, and runs browser tests.

## Browser Tests

```sh
npx playwright install chromium
npx playwright test
```

The nine tests start Vite automatically. They cover the catalogue, configuration, controls, local-only economy rules, and rendering on desktop and mobile. Complete physics simulations cover all three circuits, 30 moving AI rivals, and both wall and head-on destruction. End-to-end tests also play a real race, spend the earned winnings on a car, reload the saved leaderboard, and restart after a real crash. GPU timing varies by device; a software-rendered CI browser is not a reliable FPS benchmark.

## Performance and Compatibility

The renderer targets 60 fps using fixed-timestep physics, a capped pixel ratio, batched car bodywork, instanced city geometry, a bounded particle pool, capped debris, throttled HUD updates, and a simplified mobile render path. Auto quality drops bloom and resolution on sustained slow frames. A 60 fps minimum cannot be guaranteed across all hardware, especially 30-rival races on low-end phones. Choose Low graphics or reduce the opponent count if needed.

A current browser with WebGL 2 and hardware acceleration is required. Web Audio is optional. Fonts use Google Fonts with system fallbacks. The cinematic lobby image is AI-generated artwork; the playable world and vehicles are rendered live in Three.js, not video or that image.

## Project Layout

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | App state, navigation, progression |
| `src/components/` | Race hub, shop, leaderboard, settings, race HUD |
| `src/game/engine.ts` | Simulation, AI, damage, controls, scoring |
| `src/game/track.ts` | Procedural circuits, city, barriers |
| `src/game/carModel.ts` | Batched car meshes and breakable panels |
| `src/game/particles.ts` | Pooled sparks, explosion, boost effects |
| `src/game/audio.ts` | Synthesized audio |
| `src/game/catalog.ts` | All 216 cars and track definitions |
| `src/game/storage.ts` | Validated local saves and victory rewards |
| `render.yaml` | Render static-site Blueprint |

## O'zbekcha Qisqa Yo'riqnoma

`npm ci` va `npm run dev` bilan o'yinni ishga tushiring. QUICK RACE tugmasi poygani boshlaydi. A/D bilan boshqaring, Shift bilan nitro ishlating, S bilan tormoz bosing. Telefonda ekrandagi tugmalardan foydalaning.

Pul faqat birinchi o'rinni olganingizda beriladi. Garage bo'limida 216 ta konfiguratsiyadan mashina sotib olish va tanlash mumkin. Botlar soni 1 dan 30 gacha, qiyinlik va aylanalar soni sozlanadi. Natijalar shu brauzerda saqlanadi.

GitHub repozitoriyini yaratish uchun shaxsiy GitHub hisobingizga kirish kerak. Renderga joylash uchun repozitoriyni ulang va `render.yaml` Blueprint faylidan foydalaning. Yuqorida to'liq buyruqlar va qadamlar berilgan.