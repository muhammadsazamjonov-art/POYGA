# REDLINE

A browser-based arcade street-racing game built with React, TypeScript, and Vite. The race runs locally in the browser and does not need an account, API key, or backend.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. To check the deployment build:

```sh
npx tsc --noEmit
npm run build
npm run preview
```

## Play

- Select **Quick Race** or **Start Race** to begin a night run.
- Steer with **A/D** or **Left/Right**; accelerate with **W/Up** and brake with **S/Down**.
- Hold **Shift** or **Space** to use nitro. **P** or **Escape** pauses, and **R** restarts.
- On touchscreens, use the on-screen steering, accelerator, and nitro controls.
- Avoid traffic, build your score, and try to beat the best score saved in this browser.

The high score is stored locally under `redline-best-v1`; it is not synced to a server.

## Deploy to Render

The included `render.yaml` configures a Render static site. Connect the repository as a Blueprint; Render runs `npm ci && npx tsc --noEmit && npm run build` and publishes `dist`. For manual setup, use the same build command, publish directory `dist`, and add a rewrite from `/*` to `/index.html`.
