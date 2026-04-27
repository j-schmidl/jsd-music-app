import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="update-prompt" role="status">
      <span className="update-prompt__text">Neue Version verfügbar.</span>
      <button
        type="button"
        className="update-prompt__action"
        onClick={() => void updateServiceWorker(true)}
      >
        Aktualisieren
      </button>
      <button
        type="button"
        className="update-prompt__dismiss"
        aria-label="Hinweis schließen"
        onClick={() => setNeedRefresh(false)}
      >
        ×
      </button>
    </div>
  );
}
