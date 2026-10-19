// Settings and session history in localStorage. Every access is guarded:
// storage can be unavailable (private mode, blocked site data).

const KEY = 'plank-run:v1';

export const DEFAULT_SETTINGS = {
  game: 'fireflies',    // 'fireflies' | 'tunnel'
  camera: 'front',      // 'front' | 'side'
  control: 'x',         // front camera: 'x' (left/right) | 'y' (up/down)
  kneePlank: false,
  target: 30,           // seconds: 20 / 30 / 45, never longer (plan §6.5)
  sensitivity: 1,
  model: 'lite',        // 'lite' | 'full'
  sound: true,
  voice: true,
  showCamera: true,
};

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Not fatal: the app just won't remember.
  }
}

export const TARGETS = [20, 30, 45];

export function loadSettings() {
  const settings = { ...DEFAULT_SETTINGS, ...(read().settings ?? {}) };
  // Older versions allowed up to 2 minutes.
  if (!TARGETS.includes(settings.target)) settings.target = DEFAULT_SETTINGS.target;
  return settings;
}

export function loadSafety() {
  return read().safety ?? null;
}

export function saveSafety(safety) {
  write({ ...read(), safety });
}

export function saveSettings(settings) {
  write({ ...read(), settings });
}

export function loadHistory() {
  return read().history ?? [];
}

export function addSession(session) {
  const data = read();
  const history = [session, ...(data.history ?? [])].slice(0, 50);
  write({ ...data, history });
  return history;
}
