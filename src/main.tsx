import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ArrowUpRight, Gauge, Play, Settings, Trophy, Zap } from 'lucide-react';
import './style.css';
import heroImage from '../redline-hero.jpg';
import { Race } from './game/Race';
import type { RacerResult } from './game/racer';
import { Modal } from './components/Modal';
import { TicTacToe } from './TicTacToe';

type Screen = 'home' | 'garage' | 'records' | 'race' | 'arcade';
type Quality = 'high' | 'low';

interface Prefs {
  driver: string;
  quality: Quality;
  shake: boolean;
}

interface RunRecord {
  score: number;
  time: number;
  distance: number;
  date: string;
}

interface Stats {
  runs: number;
  crashes: number;
  distance: number;
  topSpeed: number;
  recent: RunRecord[];
}

const BEST_KEY = 'redline-best-v1';
const PREFS_KEY = 'redline-prefs-v1';
const STATS_KEY = 'redline-stats-v1';

function readText(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeText(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing or a full quota should never break the game.
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readText(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readBest() {
  const value = Number(readText(BEST_KEY));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function readPrefs(): Prefs {
  const raw = readJson<Partial<Prefs>>(PREFS_KEY, {});
  return {
    driver: typeof raw.driver === 'string' ? raw.driver.slice(0, 18) : '',
    quality: raw.quality === 'low' ? 'low' : 'high',
    shake: raw.shake !== false,
  };
}

function readStats(): Stats {
  const raw = readJson<Partial<Stats>>(STATS_KEY, {});
  const safeNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
  const recent = Array.isArray(raw.recent)
    ? raw.recent
        .filter((run): run is RunRecord => !!run && typeof run === 'object' && typeof run.score === 'number' && typeof run.date === 'string')
        .slice(0, 5)
    : [];
  return {
    runs: safeNumber(raw.runs),
    crashes: safeNumber(raw.crashes),
    distance: safeNumber(raw.distance),
    topSpeed: safeNumber(raw.topSpeed),
    recent,
  };
}

function formatScore(value: number) {
  return Math.round(value).toLocaleString('en-US');
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [best, setBest] = useState(readBest);
  const [stats, setStats] = useState<Stats>(readStats);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const bestRef = useRef(best);
  bestRef.current = best;
  const statsRef = useRef(stats);
  statsRef.current = stats;

  useEffect(() => {
    writeText(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const go = useCallback((next: Screen) => {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const startRace = useCallback(() => {
    setHowToOpen(false);
    setSettingsOpen(false);
    go('race');
  }, [go]);

  const finishRun = useCallback((result: RacerResult) => {
    if (result.score > bestRef.current) {
      bestRef.current = result.score;
      setBest(result.score);
      writeText(BEST_KEY, String(result.score));
    }
    const previous = statsRef.current;
    const next: Stats = {
      runs: previous.runs + 1,
      crashes: previous.crashes + 1,
      distance: previous.distance + Math.round(result.distance),
      topSpeed: Math.max(previous.topSpeed, Math.round(result.topSpeed)),
      recent: [{ score: result.score, time: result.time, distance: result.distance, date: new Date().toISOString() }, ...previous.recent].slice(0, 5),
    };
    statsRef.current = next;
    setStats(next);
    writeText(STATS_KEY, JSON.stringify(next));
  }, []);

  if (screen === 'race') {
    return <Race best={best} driver={prefs.driver} quality={prefs.quality} shake={prefs.shake} onExit={() => go('home')} onFinish={finishRun} />;
  }

  const distanceKm = stats.distance / 1000;

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="#home" onClick={event => { event.preventDefault(); go('home'); }}>
          <span className="mark">R</span> REDLINE<span className="dot">.</span>
        </a>
        <nav aria-label="Primary">
          <button className={screen === 'home' ? 'selected' : ''} aria-current={screen === 'home' ? 'page' : undefined} onClick={() => go('home')}>THE STREETS</button>
          <button className={screen === 'garage' ? 'selected' : ''} aria-current={screen === 'garage' ? 'page' : undefined} onClick={() => go('garage')}>GARAGE</button>
          <button className={screen === 'records' ? 'selected' : ''} aria-current={screen === 'records' ? 'page' : undefined} onClick={() => go('records')}>RECORDS</button>
          <button className={screen === 'arcade' ? 'selected' : ''} aria-current={screen === 'arcade' ? 'page' : undefined} onClick={() => go('arcade')}>ARCADE</button>
        </nav>
        <div className="header-right">
          <span><Trophy size={15} /> {formatScore(best)} <small>BEST</small></span>
          <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
        </div>
      </header>

      {screen === 'home' && (
        <>
          <section className="hero-section">
            <img src={heroImage} alt="A supercar tearing through a neon-lit city at night" fetchPriority="high" />
            <div className="hero-gradient" />
            <div className="hero-live-badge"><i /> LIVE 3D ENGINE</div>
            <div className="hero-copy">
              <div className="eyebrow"><i /> THE NIGHT IS YOURS <span>— 01 / AFTERDARK</span></div>
              <h1>CHASE THE<br /><span>REDLINE.</span></h1>
              <p>Four lanes. Fourteen rivals. One endless night.<br className="desktop-break" /> A real-time 3D street race, built for your browser.</p>
              <div className="hero-buttons">
                <button className="primary-btn" onClick={startRace}><Play size={16} fill="currentColor" /> START RACE <span>↗</span></button>
                <button className="text-btn" onClick={() => go('arcade')}>PLAY 3 IN A ROW <span>→</span></button>
              </div>
              <div className="hero-foot"><span><i /> NO DOWNLOAD. JUST DRIVE.</span><span>35.6762° N &nbsp; 139.6503° E</span></div>
            </div>
          </section>

          <section className="race-setup" aria-label="Race setup">
            <div className="section-title"><div><small>01 / RACE SETUP</small><h2>YOUR RACE. YOUR RULES.</h2></div><span>No laps. No mercy. Just the night.</span></div>
            <div className="setup-grid">
              <div className="track-card">
                <div className="track-icon">⌁</div>
                <div><small>SELECT CIRCUIT</small><strong>TOKYO AFTERDARK</strong><span>NIGHT RUN &nbsp;·&nbsp; ENDLESS &nbsp;·&nbsp; 4 LANES</span></div>
              </div>
              <div className="opponent-card">
                <div className="control-heading"><span>THE GRID</span><strong>14<small> TRAFFIC CARS</small></strong></div>
                <div className="setup-facts">
                  <span><Zap size={12} /> NITRO BOOST</span>
                  <span><Gauge size={12} /> 340 KM/H</span>
                  <span><Trophy size={12} /> NEAR MISS +150</span>
                </div>
                <div className="range-labels"><span>LIVE 3D</span><span>WEBGL 2.0</span></div>
              </div>
              <div className="start-card">
                <button onClick={startRace}>
                  <span>START RACE <ArrowRight size={21} /></span>
                  <small><Trophy size={13} /> BEAT YOUR BEST · {formatScore(best)} PTS</small>
                </button>
              </div>
            </div>
            <div className="controls-strip">
              <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>DRIVE</span></div>
              <div><kbd>SHIFT</kbd><span>NITRO</span></div>
              <div><kbd>P</kbd><span>PAUSE</span></div>
              <div><kbd>R</kbd><span>RESTART</span></div>
              <span className="controls-note">GRAZE A CAR FOR A BONUS · HIT ONE AND THE RUN IS OVER</span>
              <button className="arcade-link" onClick={() => setHowToOpen(true)}>HOW TO DRIVE</button>
              <button className="arcade-link" onClick={() => go('arcade')}>ARCADE · 3 IN A ROW <span>→</span></button>
            </div>
          </section>

          <footer className="site-footer"><span><i /> ALL SYSTEMS GO <b>/</b> REACT + THREE.JS</span><span>REDLINE <b>v2.0</b></span></footer>
        </>
      )}

      {screen === 'arcade' && <TicTacToe onBack={() => go('home')} />}

      {screen === 'garage' && (
        <section className="secondary-page garage-page">
          <div className="eyebrow"><i /> YOUR MACHINE</div>
          <h1>BUILT FOR<br /><span>THE NIGHT.</span></h1>
          <div className="garage-car">
            <img src={heroImage} alt="Vortex GT waiting on the neon streets" />
            <div>
              <small>STARTER / CLASS S</small>
              <h2>VORTEX GT</h2>
              <p>Balanced downforce, instant response, and enough nitro to bend the horizon. One machine is all the night asks for.</p>
              <div className="car-stats">
                <div><span>TOP SPEED</span><div><i style={{ width: '86%' }} /></div><strong>340 KM/H</strong></div>
                <div><span>HANDLING</span><div><i style={{ width: '78%' }} /></div><strong>9.1 / 10</strong></div>
                <div><span>NITRO</span><div><i style={{ width: '92%' }} /></div><strong>PHASE II</strong></div>
              </div>
              <button className="primary-btn" onClick={startRace}><Play size={16} fill="currentColor" /> TAKE IT TO THE STREETS</button>
            </div>
          </div>
          <div className="car-facts">
            <div><span>DRIVETRAIN</span><strong>REAR WHEEL</strong></div>
            <div><span>ENGINE</span><strong>3.8L TWIN-TURBO</strong></div>
            <div><span>0 — 100</span><strong>3.2 SECONDS</strong></div>
            <div><span>BUILD</span><strong>NIGHT SPEC</strong></div>
          </div>
          <button className="back-link" onClick={() => go('home')}><ArrowLeft size={13} /> BACK TO THE STREETS</button>
        </section>
      )}

      {screen === 'records' && (
        <section className="secondary-page records-page">
          <div className="eyebrow"><i /> LOCAL LEADERBOARD</div>
          <h1>STREET<br /><span>LEGENDS.</span></h1>
          <div className="records-layout">
            <div className="record-card">
              <Trophy size={34} />
              <small>PERSONAL BEST</small>
              <strong>{formatScore(best)} <em>PTS</em></strong>
              <p>Every run is saved on this device. No account, no cloud, no excuses.</p>
              <button className="primary-btn" onClick={startRace}><Play size={16} fill="currentColor" /> MAKE YOUR MARK</button>
            </div>
            <div className="records-stats">
              <div><span>RUNS</span><strong>{stats.runs}</strong></div>
              <div><span>TOP SPEED</span><strong>{stats.topSpeed}<small> KM/H</small></strong></div>
              <div><span>DISTANCE</span><strong>{distanceKm.toFixed(1)}<small> KM</small></strong></div>
              <div><span>WRECKS</span><strong>{stats.crashes}</strong></div>
            </div>
          </div>
          <div className="recent-runs">
            <div className="recent-runs-head"><h2>LAST FIVE RUNS</h2><span>THIS DEVICE</span></div>
            {stats.recent.length === 0 ? (
              <p className="empty-runs">No runs yet. The streets are waiting — hold <kbd>W</kbd> and find out what you are made of.</p>
            ) : (
              <ol>
                {stats.recent.map((run, index) => (
                  <li key={`${run.date}-${index}`}>
                    <span className="run-rank">{String(index + 1).padStart(2, '0')}</span>
                    <span className="run-score">{formatScore(run.score)} <small>PTS</small></span>
                    <span className="run-detail">{formatTime(run.time)} <i /> {(run.distance / 1000).toFixed(2)} KM</span>
                    <span className="run-date">{formatDate(run.date)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <button className="back-link" onClick={() => go('home')}><ArrowLeft size={13} /> BACK TO THE STREETS</button>
        </section>
      )}

      <div className="corner-stamp">POYGA <span>×</span> REDLINE</div>

      {settingsOpen && (
        <Modal eyebrow="SETTINGS / THIS DEVICE" title="YOUR DRIVING STYLE." onClose={() => setSettingsOpen(false)}>
          <label className="setting-row">
            <span><strong>Driver name</strong><small>Shown on your local records and in the cockpit</small></span>
            <input
              aria-label="Driver name"
              value={prefs.driver}
              maxLength={18}
              placeholder="DRIVER 01"
              onChange={event => setPrefs(current => ({ ...current, driver: event.target.value }))}
            />
          </label>
          <div className="setting-row">
            <span><strong>Render quality</strong><small>High adds neon bloom. Low keeps older GPUs fluid.</small></span>
            <div className="segmented-control" role="group" aria-label="Render quality">
              {(['high', 'low'] as Quality[]).map(quality => (
                <button key={quality} aria-pressed={prefs.quality === quality} className={prefs.quality === quality ? 'active' : ''} onClick={() => setPrefs(current => ({ ...current, quality }))}>
                  {quality === 'high' ? 'HIGH' : 'LOW'}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span><strong>Camera shake</strong><small>Adds speed rumble and crash impact.</small></span>
            <button className={`switch ${prefs.shake ? 'on' : ''}`} role="switch" aria-checked={prefs.shake} aria-label="Camera shake" onClick={() => setPrefs(current => ({ ...current, shake: !current.shake }))}><i /></button>
          </div>
          <p className="settings-note">Your settings, best score and last five runs stay in this browser. No account required.</p>
          <button className="primary-btn" onClick={() => setSettingsOpen(false)}>DONE <ArrowRight size={17} /></button>
        </Modal>
      )}

      {howToOpen && (
        <Modal eyebrow="THE BASICS / 30 SECONDS" title="HOW TO DRIVE." onClose={() => setHowToOpen(false)} wide>
          <div className="how-to-grid">
            <div><span className="keys"><kbd>W</kbd><kbd>↑</kbd></span><strong>Accelerate</strong><p>Build speed. The faster you go, the more the run is worth.</p></div>
            <div><span className="keys"><kbd>A</kbd><kbd>D</kbd></span><strong>Steer</strong><p>Weave through four lanes of live traffic. The barrier is not forgiving.</p></div>
            <div><span className="keys"><kbd>SHIFT</kbd><kbd>SPACE</kbd></span><strong>Nitro</strong><p>Extra thrust and a wider field of view. Drains fast, refills itself.</p></div>
            <div><span className="keys"><kbd>P</kbd><kbd>ESC</kbd></span><strong>Pause</strong><p>Freeze the night. Resume exactly where you stopped.</p></div>
            <div><span className="keys"><kbd>R</kbd></span><strong>Restart</strong><p>One clean run. One more chance. The scoreboard is patient.</p></div>
            <div><span className="keys"><kbd>TOUCH</kbd></span><strong>Mobile</strong><p>Use the on-screen steering and pedals. Gas is your friend.</p></div>
          </div>
          <div className="how-to-callout"><Zap size={17} /><p><strong>Near misses pay.</strong> Slip past a car within a whisker for <b>+150 points</b>. Touch one and the run ends.</p></div>
          <button className="primary-btn" onClick={startRace}><Play size={16} fill="currentColor" /> START YOUR FIRST RUN</button>
        </Modal>
      )}

      <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top"><ArrowUpRight size={16} /></button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
