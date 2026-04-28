import './BottomNav.css';

type Tab = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

const TABS: Tab[] = [
  { id: 'stimmen', label: 'Stimmen', icon: <TunerIcon /> },
  { id: 'lernen', label: 'Lernen', icon: <LearnIcon /> },
];

type Props = {
  active: string;
  onChange?: (id: string) => void;
};

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            className={`bottom-nav__tab${isActive ? ' bottom-nav__tab--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            data-testid={`nav-${tab.id}`}
            onClick={() => onChange?.(tab.id)}
          >
            <span className="bottom-nav__icon">{tab.icon}</span>
            <span className="bottom-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function TunerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="10" r="5" />
      <line x1="12" y1="15" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function LearnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15c-4-2-6-2-9-2V5c3 0 5 0 9 2" />
      <path d="M12 15c4-2 6-2 9-2V5c-3 0-5 0-9 2" />
      <line x1="12" y1="7" x2="12" y2="22" />
    </svg>
  );
}
