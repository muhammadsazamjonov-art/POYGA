import { Keyboard, Monitor, Volume2, Zap } from 'lucide-react';
import { useState } from 'react';
import type { Profile, Settings } from '../game/types';
import { Modal } from './Modal';

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description: string }) {
  return <div className="setting-row"><div><strong>{label}</strong><p>{description}</p></div><button className={`toggle ${checked ? 'on' : ''}`} onClick={onChange} role="switch" aria-checked={checked} aria-label={label}><span /></button></div>;
}

export function SettingsPanel({ profile, onChange, onClose }: { profile: Profile; onChange: (profile: Profile) => void; onClose: () => void }) {
  const [name, setName] = useState(profile.name);
  const set = (key: keyof Settings, value: Settings[keyof Settings]) => onChange({ ...profile, settings: { ...profile.settings, [key]: value } });
  return <Modal title="YOUR DRIVING STYLE." eyebrow="SETTINGS / SAVED AUTOMATICALLY" onClose={onClose}>
    <label className="profile-name-field"><span className="field-label">DRIVER NAME</span><input value={name} maxLength={18} aria-label="Driver name" onChange={event => setName(event.target.value)} onBlur={() => { const clean = name.trim().toUpperCase() || 'DRIVER 01'; setName(clean); onChange({ ...profile, name: clean }); }} /></label>
    <div className="settings-section-title"><Volume2 size={16} /> SOUND & FEEL</div><Toggle label="Engine & race audio" description="Synthesized engines, impacts, and race cues." checked={profile.settings.sound} onChange={() => set('sound', !profile.settings.sound)} /><Toggle label="Impact camera shake" description="Feel the boost. Feel the consequences." checked={profile.settings.shake} onChange={() => set('shake', !profile.settings.shake)} />
    <div className="settings-section-title"><Zap size={16} /> DRIVING ASSISTS</div><Toggle label="Auto-accelerate" description="Focus on the racing line. Brake when you need to." checked={profile.settings.autoAccelerate} onChange={() => set('autoAccelerate', !profile.settings.autoAccelerate)} /><Toggle label="Corner assist" description="Gently follow the racing line when not steering." checked={profile.settings.steeringAssist} onChange={() => set('steeringAssist', !profile.settings.steeringAssist)} />
    <div className="settings-section-title"><Monitor size={16} /> GRAPHICS</div><div className="setting-row"><div><strong>Rendering quality</strong><p>Auto adapts resolution to your device.</p></div><select className="settings-select" value={profile.settings.quality} onChange={event => set('quality', event.target.value as Settings['quality'])}><option value="auto">Auto</option><option value="high">High</option><option value="low">Low</option></select></div><p className="modal-footnote">Graphics and driving changes apply to your next race. Progress is stored locally in this browser.</p>
  </Modal>;
}

export function ControlsPanel({ onClose }: { onClose: () => void }) {
  return <Modal title="LESS TALK. MORE THROTTLE." eyebrow="THE DRIVER'S HANDBOOK" onClose={onClose}>
    <div className="controls-intro"><Keyboard size={23} /><p>Auto-accelerate is on by default. Steer, hit the boost, and make your first ten seconds count.</p></div>
    <div className="control-list">{[['W / Up', 'Accelerate'], ['A D / Left Right', 'Steer'], ['S / Down', 'Brake'], ['Shift', 'Nitro boost'], ['Space', 'Handbrake / drift'], ['F', 'Recover to track (-200 pts)'], ['C', 'Switch camera'], ['Esc / P', 'Pause / resume'], ['R', 'Instant restart'], ['M', 'Toggle sound']].map(([keys, label]) => <div key={keys}><span>{label}</span><kbd>{keys}</kbd></div>)}</div>
    <div className="handbook-note"><strong>TOUCH THE STREETS.</strong><p>On mobile, hold the on-screen arrows to steer. Use the boost, throttle, and brake pedals on the right. Landscape gives you the best view.</p></div><div className="handbook-note"><strong>WIN IT. DON'T BIN IT.</strong><p>Only first place earns credits. Hard impacts damage your car; a devastating collision sends the bodywork flying. Your free Vortex GT is always ready for another run.</p></div>
  </Modal>;
}