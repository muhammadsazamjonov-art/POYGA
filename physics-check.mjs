import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.goto('http://localhost:5173');
page.on('pageerror', error => console.log('ERROR:', error.message));
const report = await page.evaluate(async () => {
  const { RaceEngine } = await import('/src/game/engine.ts');
  const { CARS } = await import('/src/game/catalog.ts');
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;width:640px;height:400px;z-index:1000';
  document.body.appendChild(container);
  let hud;
  const engine = new RaceEngine(container, { track: 'tokyo', opponents: 7, laps: 1, difficulty: 'pro' }, CARS[0], { sound: false, autoAccelerate: true, steeringAssist: true, quality: 'low', shake: true }, value => { hud = value; }, console.log, console.error);
  cancelAnimationFrame(engine.animationFrame);
  engine.countdown = 0;
  const snapshots = [];
  for (let i = 0; i < 600; i++) {
    engine.elapsed += 1 / 60;
    engine.updateVehicles(1 / 60);
    if (i === 1) snapshots.push({ force: engine.player.body.force.clone(), mass: engine.player.body.mass, type: engine.player.body.type, damping: engine.player.body.linearDamping });
    engine.world.step(1 / 60);
    engine.afterPhysics(1 / 60);
    if (i % 60 === 0) snapshots.push({ i, p: engine.player.body.position.clone(), v: engine.player.body.velocity.clone(), health: engine.player.health, force: engine.player.body.force.clone(), heading: engine.player.heading, progress: engine.player.progress });
  }
  engine.emitHud();
  const rivals = engine.vehicles.map(v => ({ name: v.name, progress: v.progress, speed: v.body.velocity.length() }));
  engine.dispose();
  container.remove();
  return { snapshots, hud, rivals };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();