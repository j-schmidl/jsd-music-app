import { useEffect, useState } from 'react';
import './WaveBackground.css';

// Two distinct wave figures from the Markensystem delivery. They orbit around
// pivots placed above the visible app: one above the top-right corner, one
// above the top-left corner.
const WAVE_ASSETS = ['/waves/element_09.svg', '/waves/element_10.svg'];

export function WaveBackground() {
  const [markups, setMarkups] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      WAVE_ASSETS.map((src) =>
        fetch(src)
          .then((res) => (res.ok ? res.text() : ''))
          .catch(() => ''),
      ),
    ).then((results) => {
      if (!cancelled) setMarkups(results.map(stripStyleBlock));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="wave-bg" aria-hidden="true">
      {markups[0] && (
        <div className="wave-bg__orbit wave-bg__orbit--top-right">
          <div className="wave-bg__shape wave-bg__shape--a" dangerouslySetInnerHTML={{ __html: markups[0] }} />
        </div>
      )}
      {markups[1] && (
        <div className="wave-bg__orbit wave-bg__orbit--top-left">
          <div className="wave-bg__shape wave-bg__shape--b" dangerouslySetInnerHTML={{ __html: markups[1] }} />
        </div>
      )}
    </div>
  );
}

// Remove the inline <style> block so our CSS can override stroke/fill on the SVG lines.
function stripStyleBlock(svg: string): string {
  return svg.replace(/<style[\s\S]*?<\/style>/gi, '');
}
