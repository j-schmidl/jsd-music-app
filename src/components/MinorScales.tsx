import { MINOR_KEYS, buildMinorScale, type MinorVariant } from '../lib/scales';
import { ScaleGame, type ScaleGameConfig } from './ScaleGame';

const VARIANTS: readonly MinorVariant[] = ['natural', 'harmonic', 'melodic'];

const VARIANT_LABELS: Record<MinorVariant, string> = {
  natural: 'natürliches Moll',
  harmonic: 'harmonisches Moll',
  melodic: 'melodisches Moll',
};

const MINOR_CONFIG: ScaleGameConfig = {
  id: 'minor-scales',
  title: 'Moll-Tonleitern',
  // Natural minor step pattern; harmonic/melodic raise the 6th/7th degree.
  formula: 'G–h–G–G–h–G–G',
  storageKey: 'jsd-minorscales-settings',
  keys: MINOR_KEYS,
  infoTitle: 'Was bedeuten die Tonleiter-Arten?',
  info: [
    {
      term: 'Natürliches Moll',
      text: 'Die Grundform (äolisch). Schrittfolge Ganz-Halb-Ganz-Ganz-Halb-Ganz-Ganz. Beispiel: a-Moll = A B C D E F G — ganz ohne Vorzeichen.',
    },
    {
      term: 'Harmonisches Moll',
      text: 'Wie natürliches Moll, aber die 7. Stufe wird um einen Halbton erhöht. Das ergibt einen starken „Leitton" zum Grundton. Beispiel: a-Moll harmonisch = A B C D E F G♯ (G wird zu G♯).',
    },
    {
      term: 'Melodisches Moll',
      text: 'Aufwärts werden die 6. UND die 7. Stufe erhöht — das vermeidt den großen Sprung des harmonischen Moll. Beispiel: a-Moll melodisch (aufwärts) = A B C D E F♯ G♯.',
    },
  ],
  buildRound: (tonic) => {
    // Each round randomly picks one of the three minor variants; the prompt
    // tells the user which one so the mode itself stays hidden.
    const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
    return { notes: buildMinorScale(tonic, variant), quality: VARIANT_LABELS[variant] };
  },
};

export function MinorScales() {
  return <ScaleGame config={MINOR_CONFIG} />;
}
