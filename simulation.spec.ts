import { expect, test } from '@playwright/test';

test('circuits complete, victory pays credits, and hard collisions create rigid-body debris', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const { RaceEngine } = await import('/src/game/engine.ts');
    const { CARS } = await import('/src/game/catalog.ts');
    const reports = [];
    const settings = { sound: false, autoAccelerate: true, steeringAssist: true, quality: 'low', shake: false };
    for (const scenario of ['tokyo', 'harbor', 'midnight', 'victory', 'crash', 'head-on', 'full-grid']) {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;inset:0;width:320px;height:240px';
      document.body.appendChild(container);
      let outcome = null;
      let latest = null;
      const engine = new RaceEngine(container, { track: ['crash', 'head-on', 'full-grid', 'victory'].includes(scenario) ? 'tokyo' : scenario, opponents: scenario === 'full-grid' ? 30 : scenario === 'victory' || scenario === 'head-on' ? 1 : 3, laps: 1, difficulty: 'rookie' }, CARS[0], settings, (hud: unknown) => { latest = hud; }, (result: unknown) => { outcome = result; }, console.error);
      cancelAnimationFrame(engine.animationFrame);
      engine.countdown = 0;
      if (scenario === 'head-on') {
        const player = engine.player;
        const rival = engine.vehicles[1];
        const x = Math.sin(player.heading);
        const z = Math.cos(player.heading);
        rival.body.position.set(player.body.position.x + x * 12, 0.65, player.body.position.z + z * 12);
        rival.heading = player.heading + Math.PI;
        player.body.velocity.set(x * 40, 0, z * 40);
        rival.body.velocity.set(-x * 40, 0, -z * 40);
      }
      let maxDebris = 0;
      for (let frame = 0; frame < 2400 && !outcome; frame++) {
        const dt = 1 / 60;
        engine.elapsed += dt;
        if (scenario === 'crash' && frame > 130) engine.controls.left = true;
        if (scenario === 'victory') {
          const progress = engine.player.nearest / 720;
          const tangent = engine.track.tangent(progress);
          const future = engine.track.tangent(progress + 48 / engine.track.length);
          engine.controls.boost = tangent.dot(future) > 0.91;
        }
        engine.updateVehicles(dt);
        engine.world.step(dt);
        engine.afterPhysics(dt);
        engine.vehicles.forEach((vehicle: any) => {
          vehicle.mesh.position.copy(vehicle.body.position);
          vehicle.mesh.quaternion.copy(vehicle.body.quaternion);
        });
        engine.updateDebris(dt);
        maxDebris = Math.max(maxDebris, engine.debris.length);
      }
      engine.emitHud();
      reports.push({ scenario, outcome, hud: latest, debris: maxDebris, movingBots: engine.vehicles.filter((vehicle: any) => !vehicle.player && vehicle.progress > 0.2).length });
      engine.dispose();
      container.remove();
    }
    return reports;
  });
  console.log('Simulation reports:', JSON.stringify(results.map((r: any) => ({ scenario: r.scenario, outcome: r.outcome, debris: r.debris, movingBots: r.movingBots }))));
  for (const report of results as any[]) {
    expect(report.outcome, `${report.scenario} must finish`).not.toBeNull();
    if (report.scenario === 'crash' || report.scenario === 'head-on') {
      expect(report.outcome.wrecked).toBe(true);
      expect(report.outcome.reward).toBe(0);
      expect(report.debris).toBeGreaterThan(10);
      if (report.scenario === 'head-on') expect(report.debris).toBeGreaterThan(45);
    } else if (report.scenario === 'victory') {
      expect(report.outcome.won).toBe(true);
      expect(report.outcome.reward).toBeGreaterThan(0);
    } else {
      expect(report.outcome.wrecked).toBe(false);
      expect(report.outcome.reward).toBe(report.outcome.won ? report.outcome.reward : 0);
      if (report.scenario === 'full-grid') expect(report.movingBots).toBeGreaterThan(25);
    }
  }
});