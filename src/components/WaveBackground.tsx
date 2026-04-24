import { useEffect, useState } from 'react';
import './WaveBackground.css';

const WAVE_ASSETS = ['/waves/element_05.svg', '/waves/element_09.svg', '/waves/element_10.svg'];

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
      {markups[0] && <div className="wave-bg__layer wave-bg__layer--top" dangerouslySetInnerHTML={{ __html: markups[0] }} />}
      {markups[1] && <div className="wave-bg__layer wave-bg__layer--mid" dangerouslySetInnerHTML={{ __html: markups[1] }} />}
      {markups[2] && <div className="wave-bg__layer wave-bg__layer--bottom" dangerouslySetInnerHTML={{ __html: markups[2] }} />}
    </div>
  );
}

// Remove the inline <style> block so our CSS can override stroke/fill on the SVG lines.
function stripStyleBlock(svg: string): string {
  return svg.replace(/<style[\s\S]*?<\/style>/gi, '');
}
