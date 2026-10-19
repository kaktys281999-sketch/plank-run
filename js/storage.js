// Settings and session history in localStorage. Every access is guarded:
// storage can be unavailable (private mode, blocked site data).

const KEY = 'plank-run:v1';

export const DEFAULT_SETTINGS = {
  camera: 'front',      // 'front' | 'side'
  control: 'x',         // front camera: 'x' (left/right) | 'y' (up/down)
  kneePlank: false,
  target: 60,           // seconds
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

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(read().settings ?? {}) };
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
