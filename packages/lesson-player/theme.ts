import type { ClassroomTheme } from './board/index.tsx';

const key = 'learn-anything-theme';
const changeEvent = 'learn-anything-theme-change';
let temporaryTheme: ClassroomTheme = 'light';

export function savedTheme(): ClassroomTheme {
  try {
    return localStorage.getItem(key) === 'dark' ? 'dark' : 'light';
  } catch {
    return temporaryTheme;
  }
}
export function initialTheme(): ClassroomTheme {
  return 'light';
}
export function subscribeTheme(onChange: () => void) {
  window.addEventListener(changeEvent, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener('storage', onChange);
  };
}
export function saveTheme(theme: ClassroomTheme) {
  temporaryTheme = theme;
  try {
    localStorage.setItem(key, theme);
  } catch {
    // Switching remains available when the host blocks preference storage.
  }
  window.dispatchEvent(new Event(changeEvent));
}
