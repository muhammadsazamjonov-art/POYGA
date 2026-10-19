import { useId } from 'react';
import type { CarSpec } from '../game/types';

export function CarArt({ car, className = '' }: { car: CarSpec; className?: string }) {
  const id = useId().replace(/:/g, '');
  const low = car.style === 'supercar' || car.style === 'hypercar';
  const hatch = car.style === 'hatch' || car.style === 'rally';
  const muscle = car.style === 'muscle';
  const roof = low ? 'M119 104 L168 72 Q182 67 209 72 L251 104Z' : hatch ? 'M100 106 L125 61 Q132 55 185 58 L248 105Z' : muscle ? 'M109 107 L151 66 L223 67 L269 109Z' : 'M110 107 L156 70 Q192 57 219 76 L260 107Z';
  return <svg className={`car-art ${className}`} viewBox="0 0 400 190" role="img" aria-label={`${car.color} ${car.name}`}>
    <defs>
      <linearGradient id={`paint-${id}`} x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stopColor={car.color} /><stop offset="0.55" stopColor={car.color} /><stop offset="1" stopColor="#16171b" /></linearGradient>
      <linearGradient id={`glass-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#56646c" /><stop offset="0.3" stopColor="#202a34" /><stop offset="1" stopColor="#10151c" /></linearGradient>
      <radialGradient id={`glow-${id}`}><stop stopColor={car.color} stopOpacity=".16" /><stop offset="1" stopColor={car.color} stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="205" cy="130" rx="175" ry="57" fill={`url(#glow-${id})`} />
    <ellipse cx="205" cy="149" rx="166" ry="11" fill="#080a0c" opacity=".7" />
    <path d={roof} fill={`url(#paint-${id})`} stroke={car.color} strokeWidth="1.2" />
    <path d={low ? 'M139 102 L173 77 Q187 73 206 77 L238 102Z' : hatch ? 'M113 102 L134 66 L183 65 L234 102Z' : 'M129 103 L159 75 L215 76 L250 103Z'} fill={`url(#glass-${id})`} />
    <path d="M185 76L188 104" stroke={car.color} strokeWidth="3" />
    <path d={muscle ? 'M44 108L111 101L264 103L348 111L363 125L358 140L44 141L34 128Z' : 'M43 112Q65 102 111 103L252 104Q302 101 351 119L363 131L356 142L43 141L35 130Z'} fill={`url(#paint-${id})`} stroke={car.color} strokeWidth=".7" />
    <path d="M42 131L76 130Q80 105 110 108Q136 110 139 136L274 136Q277 108 304 108Q332 109 335 134L361 130L357 145L40 144Z" fill="#11151a" />
    <path d="M143 135L271 135L252 125L164 125Z" fill={car.color} opacity=".8" />
    <path d="M145 111L258 111L244 120L172 124" fill="none" stroke="#ffffff" strokeOpacity=".16" strokeWidth="1.2" />
    <path d="M257 106L247 128" stroke="#11151a" strokeOpacity=".65" />
    <path d="M177 111H192" stroke="#16181e" strokeWidth="2" />
    <path d="M333 118L354 123L354 127L331 122Z" fill="#d8faff" />
    <path d="M42 115L60 112L60 117L42 122Z" fill="#ff3455" />
    <path d="M339 132L361 130L358 136L339 138Z" fill="#070a0e" />
    {(low || car.class === 'S' || car.style === 'rally') && <g><path d="M64 107L61 94M91 105L88 93" stroke="#171b20" strokeWidth="4" /><path d="M42 88L105 88L110 94L45 95Z" fill="#282c31" stroke={car.color} strokeWidth=".7" /></g>}
    {[109, 304].map((x) => <g key={x}>
      <circle cx={x} cy="132" r="23" fill="#090b0e" stroke="#2c3036" strokeWidth="2" />
      <circle cx={x} cy="132" r="16" fill="#171c23" stroke="#888c92" strokeWidth="2" />
      {[0, 60, 120].map(angle => <path key={angle} d={`M${x - 14} 132H${x + 14}`} stroke="#92969e" strokeWidth="2" transform={`rotate(${angle} ${x} 132)`} />)}
      <circle cx={x} cy="132" r="4" fill="#282d34" stroke="#aaaeb5" />
    </g>)}
  </svg>;
}