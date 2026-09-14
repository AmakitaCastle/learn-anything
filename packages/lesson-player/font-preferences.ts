import {
  DEFAULT_FONTS,
  parseFontSelection,
  type FontSelection,
} from '@learn-anything/lesson-schema';
const key = 'learn-anything-fonts';
let temporary: FontSelection = { ...DEFAULT_FONTS };
export function savedFonts(): FontSelection {
  try {
    const value = localStorage.getItem(key);
    return value ? parseFontSelection(JSON.parse(value)) : { ...DEFAULT_FONTS };
  } catch {
    return temporary;
  }
}
export function saveFonts(fonts: FontSelection) {
  temporary = parseFontSelection(fonts);
  try {
    localStorage.setItem(key, JSON.stringify(temporary));
  } catch {
    // Selection still works when storage is unavailable.
  }
  window.dispatchEvent(new Event('learn-anything-fonts-change'));
}

const event = 'learn-anything-fonts-change';
export function initialFontSnapshot() {
  return JSON.stringify(DEFAULT_FONTS);
}
export function savedFontSnapshot() {
  return JSON.stringify(savedFonts());
}
export function subscribeFonts(onChange: () => void) {
  window.addEventListener(event, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(event, onChange);
    window.removeEventListener('storage', onChange);
  };
}
