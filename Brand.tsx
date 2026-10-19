export function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M10 7H25.5C33 7 35 11.5 32.5 17.5C31.2 20.7 28.6 23 24.5 23H19L25.5 33H15.5L9 22L5 33H0L10 7Z" fill="currentColor" />
    <path d="M18 13L16.4 17.5H23C25.2 17.5 26.2 16.5 26.5 15C26.8 13.7 26 13 24 13H18Z" fill="#111311" />
    <path d="M35 25H40L37 33H32L35 25Z" fill="currentColor" />
  </svg>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-word">REDLINE<span className="brand-period">.</span></span>
    {!compact && <span className="brand-caption">STREET RACING REDEFINED</span>}
  </div>;
}