import { useMemo, useState } from 'react';
import { ArrowRight, Check, Coins, LockKeyhole, Search, SlidersHorizontal, X } from 'lucide-react';
import { CARS, getCar, money } from '../game/catalog';
import type { CarSpec, Profile } from '../game/types';
import { CarArt } from './CarArt';
import { Modal } from './Modal';

interface Props { profile: Profile; onBuy: (car: CarSpec) => void; onSelect: (id: number) => void; onRace: () => void }

export function Garage({ profile, onBuy, onSelect, onRace }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All cars');
  const [sort, setSort] = useState('featured');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CarSpec | null>(null);
  const current = getCar(profile.selectedCar);
  const filtered = useMemo(() => {
    let cars = CARS.filter(car => `${car.name} ${car.maker}`.toLowerCase().includes(query.toLowerCase()));
    if (filter === 'Owned') cars = cars.filter(car => profile.owned.includes(car.id));
    else if (filter !== 'All cars') cars = cars.filter(car => car.class === filter);
    if (sort === 'price-asc') cars = [...cars].sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') cars = [...cars].sort((a, b) => b.price - a.price);
    if (sort === 'speed') cars = [...cars].sort((a, b) => b.speed - a.speed);
    return cars;
  }, [query, filter, sort, profile.owned]);

  const changeFilter = (value: string) => { setFilter(value); setPage(1); };
  return <section className="garage-page page-enter">
    <div className="page-title-row"><div><div className="eyebrow">FIND YOUR NEXT OBSESSION</div><h1>THE GARAGE<span>.</span></h1><p>216 machines. One that has your name on it.</p></div><div className="garage-balance"><span>YOUR BALANCE</span><strong><Coins size={23} />{money(profile.credits)} <small>CR</small></strong></div></div>
    <div className="garage-current"><div className="garage-current-car"><CarArt car={current} /></div><div><span className="eyebrow">READY TO RACE</span><h3>{current.name}</h3><p>{current.maker} <span className={`class-tag class-${current.class}`}>{current.class}</span></p></div><button className="button button-lime" onClick={onRace}>TAKE IT TO THE STREETS <ArrowRight size={18} /></button></div>
    <div className="garage-toolbar"><div className="filter-tabs">{['All cars', 'Owned', 'S', 'A', 'B', 'C'].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => changeFilter(item)}>{item === 'Owned' ? `Owned (${profile.owned.length})` : item.length === 1 ? `Class ${item}` : item}</button>)}</div><div className="garage-tools"><label className="search-field"><Search size={17} /><input placeholder="Find your next ride..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} aria-label="Search cars" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><label className="sort-select"><SlidersHorizontal size={16} /><select aria-label="Sort cars" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="speed">Top speed</option></select></label></div></div>
    <div className="catalog-caption"><span>{filtered.length} MACHINES IN THE LINEUP</span><span>WIN RACES. EARN CREDITS. BUILD YOUR GARAGE.</span></div>
    {filtered.length ? <div className="car-grid">{filtered.slice(0, page * 12).map(car => {
      const owned = profile.owned.includes(car.id);
      const equipped = profile.selectedCar === car.id;
      return <button className={`car-card ${equipped ? 'equipped' : ''}`} key={car.id} onClick={() => setSelected(car)}>
        <div className="car-card-top"><span>{car.maker.toUpperCase()}</span><span className={`class-tag class-${car.class}`}>{car.class}</span></div><CarArt car={car} />
        <h3>{car.name}</h3><div className="car-card-stats"><span>SPD <b>{car.speed}</b></span><span>ACC <b>{car.acceleration}</b></span><span>HND <b>{car.handling}</b></span></div>
        <div className="car-card-bottom">{equipped ? <span className="lime-text"><Check size={14} /> EQUIPPED</span> : owned ? <span>OWNED</span> : <span><Coins size={15} /> {money(car.price)} <small>CR</small></span>}<ArrowRight size={17} /></div>
      </button>;
    })}</div> : <div className="empty-state"><Search size={35} /><h3>No machines found.</h3><p>Try another model, manufacturer, or class.</p><button className="text-link" onClick={() => { setQuery(''); changeFilter('All cars'); }}>Reset filters <ArrowRight size={16} /></button></div>}
    {filtered.length > page * 12 && <div className="load-more"><button className="button button-outline" onClick={() => setPage(value => value + 1)}>LOAD MORE MACHINES <span>{Math.min(12, filtered.length - page * 12)}</span></button><p>Showing {Math.min(page * 12, filtered.length)} of {filtered.length}</p></div>}
    {selected && <Modal title={selected.name} eyebrow={`${selected.maker.toUpperCase()} / CLASS ${selected.class}`} onClose={() => setSelected(null)}>
      <div className="car-detail-art"><CarArt car={selected} /></div><div className="car-detail-stats">{[['TOP SPEED', selected.speed], ['ACCELERATION', selected.acceleration], ['HANDLING', selected.handling], ['DURABILITY', selected.armor]].map(([name, value]) => <div key={name}><span>{name}</span><div className="stat-bar"><i style={{ width: `${value}%` }} /></div><b>{value}</b></div>)}</div>
      <p className="detail-description">{selected.style.charAt(0).toUpperCase() + selected.style.slice(1)} body. Tuned for the underground. Every machine brings its own speed, grip, acceleration, and crash durability to the streets.</p>
      {profile.owned.includes(selected.id) ? <button className="button button-lime button-full" onClick={() => { onSelect(selected.id); setSelected(null); }}><Check size={17} />{profile.selectedCar === selected.id ? 'KEEP EQUIPPED' : 'EQUIP THIS MACHINE'}</button> : <><div className="purchase-total"><span>MAKE IT YOURS</span><strong><Coins size={20} />{money(selected.price)} <small>CR</small></strong></div><button className="button button-lime button-full" disabled={profile.credits < selected.price} onClick={() => { onBuy(selected); setSelected(null); }}>{profile.credits < selected.price ? <><LockKeyhole size={17} />{money(selected.price - profile.credits)} CR MORE NEEDED</> : <>BUY & EQUIP <ArrowRight size={18} /></>}</button>{profile.credits < selected.price && <p className="purchase-hint">Credits are earned only by finishing a race in first place.</p>}</>}
    </Modal>}
  </section>;
}