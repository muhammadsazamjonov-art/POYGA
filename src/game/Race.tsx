import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, Flag, Gauge, Maximize, Pause, Play, RotateCcw, Trophy, Zap } from 'lucide-react';
import type { RacerControls, RacerEngine, RacerHud, RacerResult } from './racer';

interface Props {
  best: number;
  driver: string;
  quality: 'high' | 'low';
  shake: boolean;
  onExit: () => void;
  onFinish: (result: RacerResult) => void;
}

const initialHud: RacerHud = {
  phase: 'countdown',
  countdown: 3,
  speed: 0,
  score: 0,
  time: 0,
  distance: 0,
  nitro: 100,
  boosting: false,
  message: '',
};

const scoreFormat = new Intl.NumberFormat('en-US');

function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function Race({ best, driver, quality, shake, onExit, onFinish }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RacerEngine | null>(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const [hud, setHud] = useState<RacerHud>(initialHud);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<RacerResult | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const resultRef = useRef(result);
  resultRef.current = result;

  useEffect(() => {
    let active = true;
    let engine: RacerEngine | null = null;
    setLoading(true);
    setError('');
    void import('./racer')
      .then(({ RacerEngine: Engine }) => {
        if (!active || !canvasRef.current) return;
        try {
          engine = new Engine(
            canvasRef.current,
            {
              onHud: value => {
                if (active) setHud(value);
              },
              onCrash: value => {
                if (!active) return;
                setResult(value);
                finishRef.current(value);
              },
            },
            { quality, shake },
          );
          engineRef.current = engine;
          setLoading(false);
        } catch (cause) {
          console.error('Unable to start the 3D race engine:', cause);
          setError('Your browser could not start the WebGL engine. Enable hardware acceleration or switch to Low quality in Settings, then try again.');
          setLoading(false);
        }
      })
      .catch(cause => {
        console.error('Unable to load the 3D race engine:', cause);
        if (active) {
          setError('The race engine could not be loaded. Refresh the page and try again.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [quality, shake, attempt]);

  useEffect(() => {
    engineRef.current?.setPaused(paused || !!result);
  }, [paused, result]);

  const restart = useCallback(() => {
    setResult(null);
    setPaused(false);
    setHud(initialHud);
    engineRef.current?.restart();
  }, []);

  useEffect(() => {
    const map: Record<string, keyof RacerControls> = {
      KeyW: 'gas',
      ArrowUp: 'gas',
      KeyS: 'brake',
      ArrowDown: 'brake',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      ShiftLeft: 'boost',
      ShiftRight: 'boost',
      Space: 'boost',
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const action = map[event.code];
      if (action) {
        event.preventDefault();
        if (!pausedRef.current && !resultRef.current && engineRef.current) engineRef.current.controls[action] = true;
      }
      if (event.repeat) return;
      if ((event.code === 'KeyP' || event.code === 'Escape') && !resultRef.current) {
        event.preventDefault();
        setPaused(value => !value);
      }
      if (event.code === 'KeyR') {
        event.preventDefault();
        restart();
      }
      if (event.code === 'Enter' && resultRef.current) restart();
    };
    const keyup = (event: KeyboardEvent) => {
      const action = map[event.code];
      if (action && engineRef.current) engineRef.current.controls[action] = false;
    };
    const blur = () => {
      engineRef.current?.clearControls();
      if (!resultRef.current) setPaused(true);
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [restart]);

  const press = (action: keyof RacerControls) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const pressed = event.type === 'pointerdown';
    if (pressed) event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.toggle('pressed', pressed);
    if (engineRef.current && !paused && !result) engineRef.current.controls[action] = pressed;
  };
  const touchProps = (action: keyof RacerControls) => ({
    onPointerDown: press(action),
    onPointerUp: press(action),
    onPointerCancel: press(action),
    onLostPointerCapture: press(action),
  });

  const fullscreen = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen?.().catch(() => undefined);
  };

  const isRecord = !!result && result.score > 0 && result.score >= best;

  return (
    <main
      className={`race-screen ${hud.boosting ? 'is-boosting' : ''} ${paused ? 'is-paused' : ''}`}
      data-phase={hud.phase}
      data-speed={hud.speed}
      data-score={hud.score}
    >
      <div className="game-canvas" ref={canvasRef} />
      <div className="race-vignette" aria-hidden="true" />
      <div className="race-boost-glow" aria-hidden="true" />

      {!loading && !error && (
        <div className="race-hud" inert={paused || !!result}>
          <header className="race-top">
            <button className="race-icon" aria-label="Exit race" onClick={onExit}>
              <ArrowLeft size={19} />
            </button>
            <div className="race-id">
              <span className="race-live"><i /> LIVE 3D</span>
              <strong>TOKYO AFTERDARK</strong>
              <span className="race-driver">DRIVER / {driver.trim() || 'DRIVER 01'}</span>
            </div>
            <div className="race-top-actions">
              <button className="race-icon" aria-label="Toggle fullscreen" onClick={fullscreen}>
                <Maximize size={18} />
              </button>
              <button className="race-icon" aria-label="Pause race" onClick={() => setPaused(true)}>
                <Pause size={18} fill="currentColor" />
              </button>
            </div>
          </header>

          <div className="race-score-panel">
            <span>RUN SCORE</span>
            <strong data-hud="score">{scoreFormat.format(hud.score)}</strong>
            <small><Trophy size={12} /> BEST {scoreFormat.format(best)}</small>
          </div>

          <div className="race-clock">
            <span>RUN TIME</span>
            <strong data-hud="time">{clock(hud.time)}</strong>
            <small>{scoreFormat.format(hud.distance)} M TRAVELLED</small>
          </div>

          <div className="race-speed">
            <div className="race-gear">
              <span>GEAR {String(Math.max(1, Math.min(6, Math.floor(hud.speed / 52) + 1))).padStart(2, '0')}</span>
              <span className={hud.boosting ? 'boost-on' : ''}>{hud.boosting ? 'NITRO ENGAGED' : 'NITRO READY'}</span>
            </div>
            <div className="race-speed-value">
              <strong data-hud="speed">{String(hud.speed).padStart(3, '0')}</strong>
              <span>KM/H</span>
            </div>
            <div className="race-nitro">
              <Zap size={13} fill="currentColor" />
              <div><i style={{ width: `${hud.nitro}%` }} /></div>
              <span>{hud.nitro}%</span>
            </div>
          </div>

          <div className="race-hints">
            <span><kbd>W</kbd> GAS</span>
            <span><kbd>A</kbd><kbd>D</kbd> STEER</span>
            <span><kbd>SHIFT</kbd> NITRO</span>
            <span><kbd>P</kbd> PAUSE</span>
            <span><kbd>R</kbd> RESTART</span>
          </div>

          {hud.phase === 'countdown' && (
            <div className="race-countdown" aria-hidden="true">
              <span className="race-countdown-eyebrow">NIGHT RUN / TOKYO AFTERDARK</span>
              <strong key={hud.countdown}>{hud.countdown}</strong>
              <p>HOLD <kbd>W</kbd> OR GAS TO LAUNCH</p>
            </div>
          )}

          {hud.message && <div className="race-toast" key={hud.message}>{hud.message}</div>}

          <div className="race-touch">
            <div className="race-touch-steer">
              <button {...touchProps('left')} aria-label="Steer left"><ArrowLeft size={28} /></button>
              <button {...touchProps('right')} aria-label="Steer right"><ArrowLeft size={28} style={{ transform: 'rotate(180deg)' }} /></button>
            </div>
            <div className="race-touch-pedals">
              <button className="touch-boost" {...touchProps('boost')} aria-label="Nitro boost"><Zap size={20} fill="currentColor" /><span>NITRO</span></button>
              <button className="touch-brake" {...touchProps('brake')} aria-label="Brake"><span>BRAKE</span></button>
              <button className="touch-gas" {...touchProps('gas')} aria-label="Accelerate"><Gauge size={20} /><span>GAS</span></button>
            </div>
          </div>
        </div>
      )}

      {paused && !result && !error && (
        <div className="race-overlay" role="dialog" aria-modal="true" aria-label="Race paused">
          <section className="race-panel">
            <span className="race-eyebrow">RUN SUSPENDED / {clock(hud.time)}</span>
            <h2>THE NIGHT<br /><span>CAN WAIT.</span></h2>
            <p className="race-panel-copy">Your line, your speed, your score — all frozen exactly where you left them.</p>
            <div className="race-panel-stats">
              <div><span>SCORE</span><strong>{scoreFormat.format(hud.score)}</strong></div>
              <div><span>SPEED</span><strong>{hud.speed}<small>KM/H</small></strong></div>
              <div><span>DISTANCE</span><strong>{scoreFormat.format(hud.distance)}<small>M</small></strong></div>
            </div>
            <div className="race-actions">
              <button className="primary-btn" onClick={() => setPaused(false)} autoFocus><Play size={16} fill="currentColor" /> RESUME RUN</button>
              <button className="race-button" onClick={restart}><RotateCcw size={16} /> RESTART <kbd>R</kbd></button>
              <button className="race-button race-button-quiet" onClick={onExit}><ArrowLeft size={16} /> BACK TO STREETS</button>
            </div>
          </section>
        </div>
      )}

      {result && (
        <div className="race-overlay" role="dialog" aria-modal="true" aria-label="Race over">
          <section className="race-panel race-panel-result">
            <span className="race-eyebrow">{result.reason === 'wall' ? 'THE BARRIER ALWAYS WINS' : 'TRAFFIC DOES NOT BRAKE'}</span>
            <h2>WRECKED<span>.</span></h2>
            <p className="race-panel-copy">
              {result.reason === 'wall'
                ? 'You asked the armco for one more inch. It said no.'
                : 'You found the rear bumper of a stranger. The night keeps its secrets.'}
            </p>
            {isRecord && <div className="race-record"><Trophy size={15} /> NEW PERSONAL BEST</div>}
            <div className="race-result-grid">
              <div><span>RUN SCORE</span><strong>{scoreFormat.format(result.score)}</strong></div>
              <div><span>DISTANCE</span><strong>{scoreFormat.format(result.distance)}<small>M</small></strong></div>
              <div><span>TOP SPEED</span><strong>{result.topSpeed}<small>KM/H</small></strong></div>
              <div><span>SURVIVED</span><strong>{clock(result.time)}</strong></div>
            </div>
            <div className="race-actions">
              <button className="primary-btn" onClick={restart} autoFocus><RotateCcw size={16} /> RACE AGAIN <kbd>R</kbd></button>
              <button className="race-button" onClick={onExit}><Flag size={16} /> BACK TO STREETS</button>
            </div>
            <span className="race-panel-footnote">BEST ON THIS DEVICE · {scoreFormat.format(best)} PTS</span>
          </section>
        </div>
      )}

      {loading && (
        <div className="race-loading">
          <div className="race-loading-inner">
            <span className="race-wordmark">REDLINE<span>.</span></span>
            <div className="race-load-bar"><i /></div>
            <span className="race-loading-copy">BUILDING THE NIGHT…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="race-overlay race-overlay-error">
          <section className="race-panel">
            <span className="race-eyebrow">GRAPHICS ENGINE</span>
            <h2>A BUMP IN<br /><span>THE ROAD.</span></h2>
            <p className="race-panel-copy">{error}</p>
            <div className="race-actions">
              <button className="primary-btn" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} /> TRY AGAIN</button>
              <button className="race-button" onClick={onExit}><ArrowLeft size={16} /> BACK TO STREETS</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
