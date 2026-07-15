export const APP_VERSION = "20260715-1";

export function versioned(path) {
  return `${path}?v=${APP_VERSION}`;
}
