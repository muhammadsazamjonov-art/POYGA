import { ArrowRight, ArrowUpRight, CarFront, ChevronDown, ChevronRight, Coins, Flag, Gauge, Play, Trophy } from 'lucide-react';
import { useState } from 'react';
import { getCar, getTrack, money, raceReward, TRACKS } from '../game/catalog';
import type { Profile, RaceConfig } from '../game/types';
import { Modal } from './Modal';

interface Props {
  config: RaceConfig;
  setConfig: (config: RaceConfig) => void;
  profile: Profile;
  onStart: () => void;
  onGarage: () => void;
  onLeaderboard: () => void;
}

export function TrackMap({ path, className = '' }: { path: string; className?: string }) {
  return <svg className={className} viewBox="0 0 105 100" fill="none" aria-hidden="true"><path d={path} stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="M49 83V96M54 84V97" stroke="#c8f65a" strokeWidth="2" /></svg>;
}

export function RaceHub({ config, setConfig, profile, onStart, onGarage, onLeaderboard }: Props) {
  const [trackModal, setTrackModal] = useState(false);
  const track = getTrack(config.track);
  const car = getCar(profile.selectedCar);
  return <div className="hub-page page-enter">
    <section className="hero">
      <img className="hero-image" src="/images/redline-hero.jpg" alt="Orange supercar on the neon-lit streets of Tokyo at night" fetchPriority="high" />
      <div className="hero-shade" />
      <div className="hero-content"><div className="hero-eyebrow"><span />THE NIGHT IS YOURS</div><h1>CHASE THE<br /><span>REDLINE.</span></h1><p>Fast streets. Real physics. No second chances.<br />Leave your limits at the starting line.</p><div className="hero-actions"><button className="button button-lime quick-race" onClick={onStart}><Play size={15} fill="currentColor" /> QUICK RACE <ArrowUpRight size={21} /></button><button className="hero-garage" onClick={onGarage}>EXPLORE GARAGE <ArrowRight size={17} /></button></div><div className="hero-note"><span className="live-dot" /> NO DOWNLOAD. JUST DRIVE.</div></div>
      <div className="hero-edition"><span>VOL. 01</span><span>AFTERDARK</span></div>
      <div className="hero-bottom"><div className="hero-location"><span className="location-line" /><span>35.6762&deg; N &nbsp; 139.6503&deg; E</span></div><span className="hero-image-caption">THE STREETS DON'T SLEEP. NEITHER DO LEGENDS.</span></div>
    </section>
    <section className="race-setup" aria-label="Race setup"><div className="section-heading"><div><span className="section-index">01 /</span><h2>YOUR RACE. YOUR RULES.</h2></div><span className="setup-description">A clean win is the only payday.</span></div>
      <div className="race-config-grid">
        <button className="circuit-control setup-control" onClick={() => setTrackModal(true)}><div className="circuit-map"><TrackMap path={track.map} /></div><div><span className="field-label">SELECT CIRCUIT</span><strong>{track.name}</strong><span className="circuit-detail">NIGHT RUN <i /> {track.length}</span></div><ChevronDown size={17} /></button>
        <div className="opponent-control setup-control"><div className="opponent-heading"><label htmlFor="opponents" className="field-label">AI OPPONENTS</label><select aria-label="AI difficulty" value={config.difficulty} onChange={event => setConfig({ ...config, difficulty: event.target.value as RaceConfig['difficulty'] })}><option value="rookie">Rookie</option><option value="pro">Professional</option><option value="elite">Elite</option></select></div><div className="opponent-slider"><input id="opponents" aria-label="Number of AI opponents" type="range" min="1" max="30" value={config.opponents} style={{ '--range-progress': `${(config.opponents - 1) / 29 * 100}%` } as React.CSSProperties} onChange={event => setConfig({ ...config, opponents: Number(event.target.value) })} /><strong>{String(config.opponents).padStart(2, '0')}<small>/30</small></strong></div><div className="range-labels"><span>STREET CREW</span><span>FULL GRID</span></div></div>
        <div className="laps-control setup-control"><span className="field-label">LAPS</span><div className="segmented-control">{[1, 2, 3].map(laps => <button key={laps} aria-pressed={config.laps === laps} onClick={() => setConfig({ ...config, laps })} className={config.laps === laps ? 'active' : ''}>{laps}</button>)}</div></div>
        <button className="race-start-button" onClick={onStart}><span>START RACE <ArrowRight size={21} /></span><small><Coins size={13} /> {money(raceReward(config.opponents, config.laps, config.difficulty))} CR TO THE WINNER</small></button>
      </div>
    </section>
    <div className="hub-links"><button onClick={onGarage}><span className="hub-link-icon"><CarFront size={24} strokeWidth={1.5} /></span><div><span>YOUR MACHINE</span><strong>{car.name} <small className={`class-tag class-${car.class}`}>{car.class}</small></strong></div><ChevronRight size={18} /></button><button onClick={onGarage}><span className="hub-link-icon"><Gauge size={24} strokeWidth={1.5} /></span><div><span>BUILT FOR YOUR OBSESSION</span><strong>216 cars. Endless possibilities.</strong></div><ArrowUpRight size={18} /></button><button onClick={onLeaderboard}><span className="hub-link-icon"><Trophy size={23} strokeWidth={1.5} /></span><div><span>LOCAL LEADERBOARD</span><strong>{profile.scores.length ? `${money(profile.scores[0].score)} points. Raise the bar.` : 'Make a name for yourself.'}</strong></div><ArrowUpRight size={18} /></button></div>
    <footer className="hub-footer"><span><i className="status-dot" /> ALL SYSTEMS GO <span className="footer-divider">/</span> THREE.JS + CANNON PHYSICS</span><span className="enter-hint">PRESS <kbd>ENTER</kbd> TO QUICK RACE</span><span>REDLINE <span className="footer-version">v1.0</span></span></footer>
    {trackModal && <Modal title="PICK YOUR PLAYGROUND." eyebrow="THREE STREETS. NO LIMITS." onClose={() => setTrackModal(false)} wide><div className="track-options">{TRACKS.map(item => <button key={item.id} className={`track-option ${config.track === item.id ? 'active' : ''}`} onClick={() => { setConfig({ ...config, track: item.id }); setTrackModal(false); }}><div className="track-preview" style={{ color: item.color }}><TrackMap path={item.map} /><span>{item.id === 'tokyo' ? '01' : item.id === 'harbor' ? '02' : '03'}</span></div><span className="eyebrow">{item.subtitle}</span><h3>{item.name}</h3><div><span>{item.length}</span><span>{config.track === item.id ? 'SELECTED' : 'SELECT CIRCUIT'} <Flag size={13} /></span></div></button>)}</div><p className="modal-footnote">Every circuit has its own layout, racing line, and midnight atmosphere.</p></Modal>}
  </div>;
}