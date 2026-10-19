import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Play, RotateCcw, Settings, Trophy, X, Zap } from 'lucide-react';
import './style.css';
import heroImage from '../redline-hero.jpg';

type Screen = 'home' | 'garage' | 'records' | 'race';
const BEST_KEY = 'redline-best-v1';

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

function Racer({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [boost, setBoost] = useState(100);
  const [crashed, setCrashed] = useState(false);
  const held = useRef(new Set<string>());
  const state = useRef({ lane: 0, distance: 0, score: 0, speed: 0, boost: 100, last: 0, objects: [] as { lane: number; z: number; color: string }[], tick: 0 });

  const restart = useCallback(() => {
    state.current = { lane: 0, distance: 0, score: 0, speed: 0, boost: 100, last: 0, objects: [], tick: 0 };
    setCrashed(false); setPaused(false); setScore(0); setSeconds(0); setSpeed(0); setBoost(100);
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
      held.current.add(event.key.toLowerCase());
      if (event.key.toLowerCase() === 'p' || event.key === 'Escape') setPaused(value => !value);
      if (event.key.toLowerCase() === 'r') restart();
    };
    const up = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [restart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastUi = 0;
    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) {
        canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
      }
      const w = box.width; const h = box.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = state.current;
      const dt = Math.min((now - (g.last || now)) / 1000, 0.04); g.last = now;
      const active = !paused && !crashed;
      if (active) {
        const keys = held.current;
        const boosting = (keys.has('shift') || keys.has(' ')) && g.boost > 0;
        g.speed += (keys.has('arrowdown') || keys.has('s') ? -115 : keys.has('arrowup') || keys.has('w') ? 82 : 32) * dt;
        if (boosting) { g.speed += 150 * dt; g.boost = Math.max(0, g.boost - 34 * dt); } else g.boost = Math.min(100, g.boost + 13 * dt);
        g.speed = Math.max(0, Math.min(280, g.speed));
        if (keys.has('arrowleft') || keys.has('a')) g.lane = Math.max(-1, g.lane - 2.3 * dt);
        if (keys.has('arrowright') || keys.has('d')) g.lane = Math.min(1, g.lane + 2.3 * dt);
        g.distance += g.speed * dt / 3.6; g.score += Math.round(g.speed * dt * 0.48); g.tick += dt;
        if (g.tick > 1.3) { g.tick = 0; g.objects.push({ lane: Math.floor(Math.random() * 3) - 1, z: 0, color: ['#d3fc59', '#ff5a45', '#61c9ff'][Math.floor(Math.random() * 3)] }); }
        for (const obj of g.objects) obj.z += dt * (0.18 + g.speed / 900);
        g.objects = g.objects.filter(obj => obj.z < 1.1);
        if (g.objects.some(obj => obj.z > .86 && obj.z < .94 && Math.abs(obj.lane - g.lane) < .55)) { setCrashed(true); try { const best = Math.max(readBest(), g.score); localStorage.setItem(BEST_KEY, String(best)); } catch { /* private browsing */ } }
      }
      const sky = ctx.createLinearGradient(0, 0, 0, h * .62); sky.addColorStop(0, '#111820'); sky.addColorStop(1, '#292934'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1b2226'; ctx.fillRect(0, h * .48, w, h * .52);
      // Distant city skyline
      for (let i = 0; i < 22; i++) { const bw = w / 22; const bh = 20 + ((i * 43) % 83); const x = i * bw; ctx.fillStyle = i % 3 ? '#171d23' : '#20232a'; ctx.fillRect(x, h * .49 - bh, bw - 3, bh); if (i % 2 === 0) { ctx.fillStyle = '#d5a74b'; for (let y = h * .49 - bh + 9; y < h * .48; y += 14) ctx.fillRect(x + 5, y, 3, 4); } }
      const horizon = h * .48; const bottom = h * 1.08; const roadTop = w * .13; const roadBottom = w * .88; const center = w / 2;
      ctx.fillStyle = '#292b30'; ctx.beginPath(); ctx.moveTo(center - roadTop / 2, horizon); ctx.lineTo(center + roadTop / 2, horizon); ctx.lineTo(center + roadBottom / 2, bottom); ctx.lineTo(center - roadBottom / 2, bottom); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e8e4d7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(center - roadTop / 2, horizon); ctx.lineTo(center - roadBottom / 2, bottom); ctx.moveTo(center + roadTop / 2, horizon); ctx.lineTo(center + roadBottom / 2, bottom); ctx.stroke();
      for (let i = 0; i < 2; i++) { const xRatio = (i - .5) * .33; ctx.strokeStyle = 'rgba(255,255,255,.23)'; ctx.lineWidth = 2; ctx.setLineDash([17, 18]); ctx.lineDashOffset = -g.distance * .28; ctx.beginPath(); ctx.moveTo(center + xRatio * roadTop, horizon); ctx.lineTo(center + xRatio * roadBottom, bottom); ctx.stroke(); } ctx.setLineDash([]);
      // Neon road markers
      for (let i = 0; i < 10; i++) { const z = ((i / 10 + (g.distance / 170) % 1) % 1); const y = horizon + z * z * (h - horizon); const spread = roadTop / 2 + z * (roadBottom - roadTop) / 2; const x = i % 2 ? center - spread - 13 * z : center + spread + 13 * z; ctx.fillStyle = i % 2 ? '#c8f65a' : '#fd694f'; ctx.globalAlpha = .25 + z * .7; ctx.fillRect(x, y, 3 + z * 7, 2 + z * 8); } ctx.globalAlpha = 1;
      for (const obj of g.objects) { const z = obj.z; const y = horizon + z * z * (h - horizon) * .91; const laneX = center + obj.lane * (roadTop / 3 + z * (roadBottom - roadTop) / 3); const size = 10 + z * 57; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(laneX, y + 5, size * .65, size * .2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = obj.color; ctx.beginPath(); ctx.moveTo(laneX - size * .5, y); ctx.lineTo(laneX - size * .34, y - size * .44); ctx.lineTo(laneX + size * .33, y - size * .44); ctx.lineTo(laneX + size * .5, y); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#182128'; ctx.fillRect(laneX - size * .22, y - size * .38, size * .44, size * .2); }
      const carX = center + g.lane * roadBottom * .29; const carY = h * .83; const carW = Math.min(w * .14, 84); const carH = carW * .63;
      ctx.fillStyle = 'rgba(0,0,0,.48)'; ctx.beginPath(); ctx.ellipse(carX, carY + carH * .3, carW * .62, carH * .27, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8f65a'; ctx.beginPath(); ctx.moveTo(carX - carW * .48, carY + carH * .22); ctx.lineTo(carX - carW * .37, carY - carH * .2); ctx.lineTo(carX - carW * .19, carY - carH * .48); ctx.lineTo(carX + carW * .2, carY - carH * .48); ctx.lineTo(carX + carW * .41, carY - carH * .2); ctx.lineTo(carX + carW * .48, carY + carH * .22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a262b'; ctx.beginPath(); ctx.moveTo(carX - carW * .24, carY - carH * .25); ctx.lineTo(carX - carW * .14, carY - carH * .41); ctx.lineTo(carX + carW * .14, carY - carH * .41); ctx.lineTo(carX + carW * .26, carY - carH * .25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff6255'; ctx.fillRect(carX - carW * .39, carY + carH * .06, carW * .13, carH * .09); ctx.fillRect(carX + carW * .26, carY + carH * .06, carW * .13, carH * .09);
      if (now - lastUi > 100) { lastUi = now; setSpeed(Math.round(g.speed)); setScore(g.score); setSeconds(Math.floor(g.distance / Math.max(g.speed / 3.6, 1))); setBoost(Math.round(g.boost)); }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, [paused, crashed]);

  return <main className="race-view"><div className="race-top"><button className="icon-btn" aria-label="Back to hub" onClick={onBack}><X /></button><span className="eyebrow">TOKYO AFTERDARK <i /> STREET CIRCUIT</span><button className="icon-btn" aria-label="Restart race" onClick={restart}><RotateCcw /></button></div><div className="race-hud"><div><small>SPEED</small><strong>{speed}<em>KM/H</em></strong></div><div><small>RUN SCORE</small><strong>{score.toLocaleString()}</strong></div><div><small>TIME</small><strong>00:{String(seconds % 60).padStart(2, '0')}</strong></div><div><small>NITRO</small><div className="nitro-meter"><span style={{ width: `${boost}%` }} /></div></div></div><div className="canvas-frame"><canvas ref={canvasRef} aria-label="Playable night street racing game" />{(paused || crashed) && <div className="race-overlay"><span className="eyebrow">{crashed ? 'RACE OVER' : 'TAKE A BREATHER'}</span><h2>{crashed ? 'WRECKED.' : 'PAUSED.'}</h2><p>{crashed ? `Run score ${score.toLocaleString()} · best ${readBest().toLocaleString()}` : 'Your run is waiting right where you left it.'}</p><button className="primary-btn" onClick={() => crashed ? restart() : setPaused(false)}>{crashed ? <><RotateCcw size={17} /> RACE AGAIN</> : <><Play size={16} fill="currentColor" /> RESUME RACE</>}</button></div>}</div><div className="race-controls"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>DRIVE</span></div><div><kbd>SHIFT</kbd><span>NITRO</span></div><button className="pause-btn" onClick={() => setPaused(p => !p)}>{paused ? <Play size={16} /> : 'Ⅱ'} {paused ? 'RESUME' : 'PAUSE'}</button><div className="touch-controls"><button aria-label="Steer left" onPointerDown={() => held.current.add('arrowleft')} onPointerUp={() => held.current.delete('arrowleft')}><ArrowLeft /></button><button aria-label="Accelerate" onPointerDown={() => held.current.add('arrowup')} onPointerUp={() => held.current.delete('arrowup')}><ArrowUp /></button><button aria-label="Steer right" onPointerDown={() => held.current.add('arrowright')} onPointerUp={() => held.current.delete('arrowright')}><ArrowRight /></button><button aria-label="Nitro boost" onPointerDown={() => held.current.add('shift')} onPointerUp={() => held.current.delete('shift')}><Zap /></button></div></div></main>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [opponents, setOpponents] = useState(7);
  const [difficulty, setDifficulty] = useState('Professional');
  const [best, setBest] = useState(readBest);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { const onStorage = () => setBest(readBest()); window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage); }, []);
  if (screen === 'race') return <Racer onBack={() => { setScreen('home'); setBest(readBest()); }} />;
  return <div className="site-shell"><header className="site-header"><a className="wordmark" href="#home" onClick={e => { e.preventDefault(); setScreen('home'); }}><span className="mark">R</span> REDLINE<span className="dot">.</span></a><nav><button className={screen === 'home' ? 'selected' : ''} onClick={() => setScreen('home')}>THE STREETS</button><button className={screen === 'garage' ? 'selected' : ''} onClick={() => setScreen('garage')}>GARAGE</button><button className={screen === 'records' ? 'selected' : ''} onClick={() => setScreen('records')}>RECORDS</button></nav><div className="header-right"><span><Trophy size={15} /> {best.toLocaleString()} <small>BEST</small></span><button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button></div></header>
    {screen === 'home' && <><section className="hero-section"><img src={heroImage} alt="A supercar tearing through a neon-lit city at night" /><div className="hero-gradient" /><div className="hero-copy"><div className="eyebrow"><i /> THE NIGHT IS YOURS <span>— 01 / AFTERDARK</span></div><h1>CHASE THE<br /><span>REDLINE.</span></h1><p>Fast streets. Real physics. No second chances.<br className="desktop-break" /> Leave your limits at the starting line.</p><div className="hero-buttons"><button className="primary-btn" onClick={() => setScreen('race')}><Play size={16} fill="currentColor" /> QUICK RACE <span>↗</span></button><button className="text-btn" onClick={() => setScreen('garage')}>EXPLORE GARAGE <span>→</span></button></div><div className="hero-foot"><span><i /> NO DOWNLOAD. JUST DRIVE.</span><span>35.6762° N &nbsp; 139.6503° E</span></div></div></section><section className="race-setup"><div className="section-title"><div><small>01 / RACE SETUP</small><h2>YOUR RACE. YOUR RULES.</h2></div><span>A clean win is the only payday.</span></div><div className="setup-grid"><div className="track-card"><div className="track-icon">⌁</div><div><small>SELECT CIRCUIT</small><strong>TOKYO AFTERDARK <ChevronDown size={15} /></strong><span>NIGHT RUN &nbsp;·&nbsp; 4.2 KM</span></div></div><div className="opponent-card"><div className="control-heading"><small>AI OPPONENTS</small><strong>{String(opponents).padStart(2, '0')}<small> / 30</small></strong></div><input aria-label="Number of AI opponents" type="range" min="1" max="30" value={opponents} onChange={e => setOpponents(Number(e.target.value))} /><div className="control-heading"><span>STREET CREW</span><label><select aria-label="AI difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)}><option>Rookie</option><option>Professional</option><option>Elite</option></select></label></div></div><div className="start-card"><button onClick={() => setScreen('race')}><span>START RACE <ArrowRight /></span><small><Zap size={13} /> UP TO {(1200 + opponents * 160 + 800).toLocaleString()} CR TO THE WINNER</small></button></div></div></section><footer className="site-footer"><span><i /> ALL SYSTEMS GO <b>/</b> CANVAS ARCADE ENGINE</span><span>REDLINE <b>v1.0</b></span></footer></>}
    {screen === 'garage' && <section className="secondary-page"><div className="eyebrow"><i /> YOUR MACHINE</div><h1>BUILT FOR<br /><span>THE NIGHT.</span></h1><div className="garage-car"><img src={heroImage} alt="Vortex GT ready for the race" /><div><small>STARTER / CLASS A</small><h2>VORTEX GT</h2><p>Balanced handling. Instant response. Built to own every corner.</p><button className="primary-btn" onClick={() => setScreen('race')}><Play size={16} fill="currentColor" /> TAKE IT TO THE STREETS</button></div></div><button className="back-link" onClick={() => setScreen('home')}>← BACK TO THE STREETS</button></section>}
    {screen === 'records' && <section className="secondary-page records-page"><div className="eyebrow"><i /> LOCAL LEADERBOARD</div><h1>STREET<br /><span>LEGENDS.</span></h1><div className="record-card"><Trophy size={34} /><small>PERSONAL BEST</small><strong>{best.toLocaleString()} <em>PTS</em></strong><p>Your fastest run is saved on this device.</p><button className="primary-btn" onClick={() => setScreen('race')}><Play size={16} fill="currentColor" /> MAKE YOUR MARK</button></div><button className="back-link" onClick={() => setScreen('home')}>← BACK TO THE STREETS</button></section>}
    {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e => e.stopPropagation()}><button className="icon-btn close-modal" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X /></button><div className="eyebrow"><i /> SETTINGS / THIS DEVICE</div><h2 id="settings-title">YOUR DRIVING STYLE.</h2><label className="setting-row"><span><strong>Driver name</strong><small>Shown on your local records</small></span><input aria-label="Driver name" placeholder="DRIVER 01" maxLength={18} /></label><p className="settings-note">Your preferences and best run stay in this browser. No account required.</p><button className="primary-btn" onClick={() => setSettingsOpen(false)}>DONE <ArrowRight size={17} /></button></section></div>}
    <div className="corner-stamp">POYGA <span>×</span> REDLINE</div></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
