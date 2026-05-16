import { KEYS, buildMajorScale } from '../lib/scales';
import { ScaleGame, type ScaleGameConfig } from './ScaleGame';

const MAJOR_CONFIG: ScaleGameConfig = {
  id: 'major-scales',
  title: 'Dur-Tonleitern',
  formula: 'G–G–h–G–G–G–h',
  storageKey: 'jsd-majorscales-settings',
  keys: KEYS,
  buildRound: (tonic) => ({ notes: buildMajorScale(tonic), quality: 'dur' }),
  infoTitle: 'Wie ist eine Dur-Tonleiter aufgebaut?',
  info: [
    {
      term: 'Die Schrittfolge',
      text: 'Jede Dur-Tonleiter folgt demselben Muster aus Ganz- und Halbtonschritten: Ganz-Ganz-Halb-Ganz-Ganz-Ganz-Halb. Die zwei Halbtonschritte liegen zwischen der 3. und 4. sowie der 7. und 8. Stufe.',
    },
    {
      term: 'Jeder Buchstabe genau einmal',
      text: 'Die sieben Töne nutzen die Buchstaben A–G ohne Wiederholung. Deshalb braucht z. B. F-Dur ein B♭ (nicht A♯) — sonst käme der Buchstabe A doppelt vor.',
    },
    {
      term: 'Der Quintenzirkel',
      text: 'Jede Quinte aufwärts (C→G→D…) fügt ein Kreuz hinzu, jede Quarte aufwärts (C→F→B♭…) ein B. So hat G-Dur ein Kreuz (F♯), D-Dur zwei (F♯, C♯) und so weiter.',
    },
  ],
};

export function MajorScales() {
  return <ScaleGame config={MAJOR_CONFIG} />;
}
