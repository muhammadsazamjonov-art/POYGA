import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Camera, Coins, Flag, Gauge, Maximize, Pause, Play, RotateCcw, Shield, Trophy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import type { RaceEngine } from '../game/engine';
import { formatTime, getTrack, money } from '../game/catalog';
import type { CarSpec, Controls, RaceConfig, RaceHud, RaceResult, Settings } from '../game/types';
import { Brand } from './Brand';
import { Modal } from './Modal';

interface Props {
  config: RaceConfig;
  car: CarSpec;
  settings: Settings;
  onExit: () => void;
  onRestart: () => void;
  onResult: (result: RaceResult) => void;
  onSound: (enabled: boolean) => void;
}

const initialHud: RaceHud = { phase: 'countdown', countdown: 3, speed: 0, position: 1, lap: 1, time: 0, score: 0, health: 100, nitro: 100, boosting: false, progress: 0, rivals: [], message: '' };

function MiniMap({ hud, config }: { hud: RaceHud; config: RaceConfig }) {
  const pathRef = useRef<SVGPathElement>(null);
  const lengthRef = useRef(0);
  const track = getTrack(config.track);
  useEffect(() => { lengthRef.current = pathRef.current?.getTotalLength() ?? 1; }, [config.track]);
  return <div className="minimap"><svg viewBox="0 0 125 120" aria-label="Race circuit minimap"><g transform="translate(10,10)"><path d={track.map} fill="none" stroke="#ffffff" strokeOpacity=".06" strokeWidth="12" /><path ref={pathRef} d={track.map} fill="none" stroke="#ffffff" strokeOpacity=".42" strokeWidth="2.3" />{hud.rivals.filter(rival => rival.alive).map(rival => {
    const point = pathRef.current?.getPointAtLength((((rival.progress % 1) + 1) % 1) * lengthRef.current);
    return <circle key={rival.name} cx={point?.x ?? 54} cy={point?.y ?? 90} r={rival.player ? 4.5 : 2.6} fill={rival.player ? '#c8f65a' : '#b18dff'} stroke={rival.player ? '#15191b' : 'none'} strokeWidth="2" />;
  })}<path d="M49 84V97" stroke="#ffffff" strokeWidth="2" /></g></svg><span>{track.name.toUpperCase()}</span></div>;
}

export function RaceGame({ config, car, settings, onExit, onRestart, onResult, onSound }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RaceEngine | null>(null);
  const [hud, setHud] = useState<RaceHud>(initialHud);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(settings.sound);
  const resultRef = useRef<HTMLElement>(null);
  const current = useRef({ paused, result, onRestart, onExit, sound, onSound });
  current.current = { paused, result, onRestart, onExit, sound, onSound };
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let active = true;
    let instance: RaceEngine | null = null;
    void import('../game/engine').then(({ RaceEngine: Engine }) => {
      if (!active || !canvasRef.current) return;
      try {
        instance = new Engine(canvasRef.current, config, car, settings, setHud, finished => {
          if (!active) return;
          setResult(finished);
          onResultRef.current(finished);
        }, setError);
        engineRef.current = instance;
        instance.setPaused(current.current.paused);
        setLoading(false);
      } catch (cause) {
        console.error('Unable to initialize the race:', cause);
        setError('Your browser could not start the 3D engine. Enable hardware acceleration or choose Low graphics in Settings, then try again.');
        setLoading(false);
      }
    }).catch(() => { if (active) { setError('The race engine could not be loaded. Check your connection and try again.'); setLoading(false); } });
    return () => { active = false; instance?.dispose(); engineRef.current = null; };
    // A race is one engine session; instant restart mounts a fresh keyed component.
  }, []);

  useEffect(() => { engineRef.current?.setPaused(paused); }, [paused]);
  useEffect(() => {
    if (!result) return;
    const dialog = document.querySelector<HTMLElement>('.race-result');
    resultRef.current = dialog;
    dialog?.querySelector<HTMLButtonElement>('.result-actions button')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = resultRef.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', trapFocus);
    return () => window.removeEventListener('keydown', trapFocus);
  }, [result]);
  const toggleSound = useCallback(() => {
    const enabled = !current.current.sound;
    setSound(enabled);
    engineRef.current?.setSound(enabled);
    current.current.onSound(enabled);
  }, []);

  useEffect(() => {
    const mapping: Record<string, keyof Controls> = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'accelerate', ArrowUp: 'accelerate', KeyS: 'brake', ArrowDown: 'brake', ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'drift' };
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (mapping[event.code]) {
        event.preventDefault();
        if (!current.current.paused && !current.current.result && engineRef.current) engineRef.current.controls[mapping[event.code]] = true;
      }
      if (event.repeat) return;
      if ((event.code === 'Escape' || event.code === 'KeyP') && !current.current.result) {
        event.preventDefault();
        if (event.code === 'KeyP' || !current.current.paused) setPaused(value => !value);
      }
      if (event.code === 'KeyR') { event.preventDefault(); current.current.onRestart(); }
      if (event.code === 'KeyC') engineRef.current?.changeCamera();
      if (event.code === 'KeyF') engineRef.current?.recover();
      if (event.code === 'KeyM') toggleSound();
      if (event.code === 'Enter' && current.current.result) current.current.onRestart();
    };
    const keyup = (event: KeyboardEvent) => { if (mapping[event.code] && engineRef.current) engineRef.current.controls[mapping[event.code]] = false; };
    const blur = () => { engineRef.current?.clearControls(); if (!current.current.result) setPaused(true); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); };
  }, [toggleSound]);

  const touch = (key: keyof Controls, pressed: boolean) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (pressed) event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.toggle('pressed', pressed);
    if (engineRef.current && !paused && !result) engineRef.current.controls[key] = pressed;
  };
  const touchProps = (key: keyof Controls) => ({ onPointerDown: touch(key, true), onPointerUp: touch(key, false), onPointerCancel: touch(key, false), onLostPointerCapture: touch(key, false) });
  const fullscreen = () => { if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {}); else void document.exitFullscreen?.().catch(() => {}); };
  const track = getTrack(config.track);

  return <div className={`race-screen ${hud.boosting ? 'is-boosting' : ''}`} data-phase={hud.phase} data-speed={hud.speed}>
    <div className="game-canvas" ref={canvasRef} /><div className="race-vignette" /><div className="boost-lines" />
    {!loading && !error && <div className="race-hud" inert={paused || !!result}>
      <header className="race-hud-top"><div className="race-hud-brand"><Brand compact /><span>{track.name.toUpperCase()} <i /> {config.difficulty.toUpperCase()}</span></div><div className="race-metrics"><div><span>POSITION</span><strong>{String(hud.position).padStart(2, '0')}<small>/{String(config.opponents + 1).padStart(2, '0')}</small></strong></div><div><span>LAP</span><strong>{String(hud.lap).padStart(2, '0')}<small>/{String(config.laps).padStart(2, '0')}</small></strong></div><div className="race-time"><span>RACE TIME</span><strong>{formatTime(hud.time)}</strong></div></div><div className="race-top-actions"><button className="hud-icon-button fullscreen-button" aria-label="Toggle fullscreen" onClick={fullscreen}><Maximize size={18} /></button><button className="hud-icon-button" aria-label={sound ? 'Mute audio' : 'Enable audio'} onClick={toggleSound}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="hud-icon-button" aria-label="Pause race" onClick={() => setPaused(true)}><Pause size={19} fill="currentColor" /></button></div></header>
      <div className="race-standings"><span>THE GRID</span>{hud.rivals.slice(0, 5).map((rival, i) => <div key={rival.name} className={rival.player ? 'you' : ''}><b>{i + 1}</b><span>{rival.name}</span>{rival.player ? <Flag size={11} /> : <i className={rival.alive ? '' : 'out'} />}</div>)}</div>
      <div className="race-score"><span>RACE SCORE</span><strong>{money(hud.score)}</strong></div>
      {hud.phase === 'countdown' && <div className="race-countdown"><span>READY TO OWN THE NIGHT?</span><strong key={hud.countdown}>{hud.countdown}</strong><p>{settings.autoAccelerate ? 'AUTO-ACCELERATE ON. JUST STEER.' : 'HOLD W OR THE THROTTLE TO LAUNCH.'}</p></div>}
      {hud.message && hud.phase === 'racing' && <div className={`race-message ${hud.health === 0 ? 'crash-message' : ''}`} key={hud.message}>{hud.message}</div>}
      {hud.time < 9 && hud.phase === 'racing' && <div className="first-race-hint"><span>FIND YOUR LINE.</span><p><kbd>A</kbd><kbd>D</kbd> to steer <i /> <kbd>SHIFT</kbd> to boost</p></div>}
      <div className="race-bottom-left"><MiniMap hud={hud} config={config} /><div className={`integrity ${hud.health < 35 ? 'critical' : ''}`}><div><Shield size={13} /><span>INTEGRITY</span><strong>{hud.health}%</strong></div><div className="integrity-bar"><i style={{ width: `${hud.health}%` }} /></div></div></div>
      <div className="desktop-race-controls"><span><kbd>A</kbd><kbd>D</kbd> STEER</span><span><kbd>SHIFT</kbd> BOOST</span><span><kbd>SPACE</kbd> DRIFT</span><span><kbd>F</kbd> RECOVER</span><span><kbd>ESC</kbd> PAUSE</span></div>
      <div className="speedometer"><div className="speed-gear"><span>{Math.max(1, Math.min(6, Math.floor(hud.speed / 47) + 1))}</span><Gauge size={14} /> GEAR</div><div className="speed-number"><strong>{String(hud.speed).padStart(3, '0')}</strong><span>KM/H</span></div><div className="speed-rpm">{Array.from({ length: 24 }, (_, i) => <i key={i} className={i < hud.speed / 13 ? 'active' : ''} />)}</div><div className="nitro-meter"><Zap size={14} fill="currentColor" /><div><i style={{ width: `${hud.nitro}%` }} /></div><span>NITRO</span></div><div className="speed-car-name">{car.name.toUpperCase()} <span>CLASS {car.class}</span></div></div>
      <div className="touch-controls"><div className="touch-steer"><button {...touchProps('left')} aria-label="Steer left"><ArrowLeft size={29} /></button><button {...touchProps('right')} aria-label="Steer right"><ArrowRight size={29} /></button></div><div className="touch-pedals"><button className="touch-boost" {...touchProps('boost')} aria-label="Nitro boost"><Zap size={23} fill="currentColor" /><span>BOOST</span></button><button {...touchProps('brake')} aria-label="Brake"><span className="brake-icon" /><span>BRAKE</span></button><button {...touchProps('accelerate')} aria-label="Accelerate"><ArrowUp size={25} /><span>GAS</span></button></div></div>
    </div>}
    {loading && <div className="game-loading"><Brand /><div className="loading-road"><span /></div><span>WAKING UP THE STREETS...</span></div>}
    {paused && !result && !error && <Modal title="TAKE A BREATHER." eyebrow="RACE PAUSED / THE CITY CAN WAIT" onClose={() => setPaused(false)}><div className="pause-summary"><span>{track.name}</span><span>LAP {hud.lap}/{config.laps} <i /> P{hud.position}</span></div><div className="pause-actions"><button className="button button-lime button-full" onClick={() => setPaused(false)}><Play size={17} fill="currentColor" />BACK TO THE STREETS</button><button className="button button-outline button-full" onClick={onRestart}><RotateCcw size={17} /> RESTART RACE <kbd>R</kbd></button><button className="button button-quiet button-full" onClick={onExit}><ArrowLeft size={17} /> RETURN TO RACE HUB</button></div><div className="pause-mini-controls"><span><kbd>A D</kbd> Steer</span><span><kbd>SHIFT</kbd> Boost</span><span><kbd>SPACE</kbd> Drift</span></div><button className="text-link camera-option" onClick={() => engineRef.current?.changeCamera()}><Camera size={16} /> Switch chase camera</button></Modal>}
    {result && <div className="result-backdrop"><section className={`race-result ${result.won ? 'victory' : ''}`} role="dialog" aria-modal="true" aria-label="Race results"><button className="result-close icon-button" aria-label="Return to hub" onClick={onExit}><X size={20} /></button><div className="result-symbol">{result.won ? <Trophy size={37} strokeWidth={1.5} /> : result.wrecked ? <Shield size={37} strokeWidth={1.5} /> : <Flag size={37} strokeWidth={1.5} />}</div><span className="eyebrow">{result.won ? 'FIRST PLACE. NO EXCUSES.' : result.wrecked ? 'REAL PHYSICS. REAL CONSEQUENCES.' : 'THE FINISH LINE IS JUST THE BEGINNING.'}</span><h1>{result.won ? <>THE NIGHT<br />IS YOURS.</> : result.wrecked ? 'WRECKED.' : 'RUN COMPLETE.'}</h1><p>{result.won ? 'You owned the streets. Now own your next machine.' : result.wrecked ? 'The car is gone. The comeback is one click away.' : 'Only the winner gets paid. Your next run is the one.'}</p><div className="result-numbers"><div><span>POSITION</span><strong>{result.wrecked ? 'DNF' : `${result.position}/${result.racers}`}</strong></div><div><span>RACE SCORE</span><strong>{money(result.score)}</strong></div><div><span>RACE TIME</span><strong>{formatTime(result.time)}</strong></div></div><div className={`result-reward ${result.won ? '' : 'no-reward'}`}><Coins size={21} /><span>{result.won ? `+${money(result.reward)} CR` : '0 CR'}</span><small>{result.won ? 'ADDED TO YOUR GARAGE FUND' : 'FIRST PLACE IS THE ONLY PAYDAY'}</small></div><div className="result-actions"><button className="button button-lime" onClick={onRestart}><RotateCcw size={17} /> RACE AGAIN <kbd>R</kbd></button><button className="button button-outline" onClick={onExit}>BACK TO HUB <ArrowRight size={17} /></button></div><span className="result-saved">YOUR SCORE HAS BEEN SAVED TO THE LOCAL LEADERBOARD.</span></section></div>}
    {error && <Modal title="A BUMP IN THE ROAD." eyebrow="GRAPHICS ENGINE" onClose={onExit}><p className="error-message">{error}</p><div className="pause-actions"><button className="button button-lime button-full" onClick={onRestart}><RotateCcw size={17} /> TRY AGAIN</button><button className="button button-outline button-full" onClick={onExit}><ArrowLeft size={17} /> BACK TO HUB</button></div></Modal>}
  </div>;
}