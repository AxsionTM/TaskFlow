export type NotifySoundId = 'soft' | 'chime' | 'bells' | 'digital' | 'silent';

export const NOTIFY_SOUNDS: { id: NotifySoundId; label: string }[] = [
  { id: 'soft', label: 'Мягкий' },
  { id: 'chime', label: 'Колокольчик' },
  { id: 'bells', label: 'Перелив' },
  { id: 'digital', label: 'Цифровой' },
  { id: 'silent', label: 'Без звука' },
];

const KEY = 'tf-notif-sound';

export function getNotifySound(): NotifySoundId {
  try {
    const v = localStorage.getItem(KEY) as NotifySoundId | null;
    if (v && NOTIFY_SOUNDS.some((s) => s.id === v)) return v;
  } catch {}
  return 'soft';
}

export function setNotifySound(id: NotifySoundId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  ac: AudioContext,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 0.22
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

const MELODIES: Record<Exclude<NotifySoundId, 'silent'>, (ac: AudioContext, t0: number) => void> = {
  soft: (ac, t0) => {
    tone(ac, 880, t0, 0.35);
    tone(ac, 1174.66, t0 + 0.18, 0.4);
  },
  chime: (ac, t0) => {
    tone(ac, 1046.5, t0, 0.5, 'triangle');
    tone(ac, 1318.5, t0 + 0.22, 0.5, 'triangle');
    tone(ac, 1568, t0 + 0.44, 0.6, 'triangle');
  },
  bells: (ac, t0) => {
    tone(ac, 659.25, t0, 0.3, 'sine');
    tone(ac, 783.99, t0 + 0.15, 0.3, 'sine');
    tone(ac, 987.77, t0 + 0.3, 0.3, 'sine');
    tone(ac, 1318.5, t0 + 0.45, 0.5, 'sine');
  },
  digital: (ac, t0) => {
    tone(ac, 1200, t0, 0.12, 'square', 0.08);
    tone(ac, 1200, t0 + 0.18, 0.12, 'square', 0.08);
    tone(ac, 1500, t0 + 0.36, 0.2, 'square', 0.08);
  },
};

export function playNotifySound(id: NotifySoundId = getNotifySound()) {
  if (id === 'silent') return;
  const ac = audio();
  if (!ac) return;
  try {
    MELODIES[id](ac, ac.currentTime + 0.02);
  } catch {}
}
