import { useCallback, useEffect, useState } from 'react';

// Shared microphone-device enumeration, used by every feature that feeds the
// <MicButton> picker (the tuner's pitch pipeline and the multi-track recorder).
// It owns the device list and keeps it in sync with OS-level plug/unplug events;
// each consumer reports which device it actually opened via `setActiveDeviceId`.

export type MicDevice = {
  deviceId: string;
  label: string;
};

export type MicDevicesState = {
  devices: MicDevice[];
  activeDeviceId: string | null;
  setActiveDeviceId: (id: string | null) => void;
  refreshDevices: () => Promise<void>;
};

export function useMicDevices(): MicDevicesState {
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const mics = list
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          // Labels are empty until permission is granted — fall back to a stable
          // numbered placeholder so the picker always has something to show.
          label: d.label || `Mikrofon ${i + 1}`,
        }));
      setDevices(mics);
    } catch {
      // Ignore — the picker will just stay empty until permission unlocks labels.
    }
  }, []);

  // Keep the device list in sync with OS-level changes (plug/unplug).
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const handler = () => {
      void refreshDevices();
    };
    md.addEventListener('devicechange', handler);
    return () => md.removeEventListener('devicechange', handler);
  }, [refreshDevices]);

  return { devices, activeDeviceId, setActiveDeviceId, refreshDevices };
}
