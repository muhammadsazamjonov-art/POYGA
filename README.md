# REDLINE

A browser-based 3D arcade street race built with React, TypeScript, Three.js and Vite. Everything runs locally in the browser — no account, API key or backend.

You drive one car through four lanes of night traffic on an endless Tokyo expressway. The run is over the moment you touch a barrier above 118 km/h or clip another car, so the whole game is about holding a clean line at speed. Near misses, distance, time and nitro all feed the run score, and your best score, settings and last five runs stay in this browser.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. To check the deployable build:

```sh
npm run typecheck
npm run build
npm run preview
```

## Play

- **Start Race** on the hub, in the setup card or from the garage drops you straight onto the grid.
- Steer with **A/D** or **Left/Right**, accelerate with **W/Up**, brake with **S/Down**.
- Hold **Shift** or **Space** for nitro. **P** or **Escape** pauses, **R** restarts, **Enter** restarts from the results screen.
- On touchscreens, use the on-screen steering, nitro, brake and gas pedals.
- Graze a car within a whisker for a **+150** near-miss bonus; touch it and the run ends.
- Open **Settings** to set your driver name, switch between High/Low render quality (High adds neon bloom) and toggle camera shake.
- **Records** shows the personal best, lifetime runs, top speed, distance, plus the last five runs stored on this device.
- **Arcade** is a neon three-in-a-row game: play the CPU on Easy, Normal or Impossible (perfect minimax), or pass the keyboard around in two-player mode. Wins, losses and draws persist.

## Tic-tac-toe (Arcade)

The mini game lives in `src/TicTacToe.tsx` and is reachable from the header (`ARCADE`), the hero button and the setup strip. The CPU uses full minimax with depth preference, so **Impossible** never loses; **Normal** deliberately passes 30% of the time and **Easy** mostly plays at random while still blocking obvious wins. Scores are stored under `redline-tictactoe-v1`. Keyboard shortcuts: **R** restarts a round, **Enter** starts the next one from the result state.

Storage keys: `redline-best-v1` (best score), `redline-prefs-v1` (driver name, quality, shake), `redline-stats-v1` (lifetime stats and recent runs). Nothing is uploaded.

## Architecture

```
src/
  main.tsx            hub, garage, records, arcade routing, settings, how-to-drive
  TicTacToe.tsx       three-in-a-row with minimax CPU and local scoreboard
  game/Race.tsx       full-screen race shell, HUD, keyboard + touch input, pause/results
  game/racer.ts       Three.js scene: car, road, city, traffic, bloom, fixed-step simulation
  components/Modal.tsx accessible modal shell (focus trap, Escape to close)
  style.css           design tokens, hub styles and race HUD
tests/                Playwright end-to-end coverage
```

`racer.ts` renders the scene with an instanced low-poly city, a procedurally textured road and canvas-generated neon billboards, and simulates the car on a fixed 60 Hz step so behaviour does not change with frame rate. Canvas textures and the procedural cubemap mean there are no image assets to download beyond the hero photo used on the hub.

## Deploy to Render

The included `render.yaml` configures a Render static site. Connect the repository as a Blueprint; Render runs `npm ci && npm run typecheck && npm run build` and publishes `dist`. For manual setup, use the same build command, publish directory `dist`, and add a rewrite from `/*` to `/index.html`.
