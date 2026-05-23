/// <reference types="vite/client" />

// Older WebKit (iOS Safari) exposes the constructor under a vendor prefix.
// Declared here so callers can read `window.webkitAudioContext` without casts.
interface Window {
  webkitAudioContext?: typeof AudioContext;
}
