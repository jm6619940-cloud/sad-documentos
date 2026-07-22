export const APP_VERSION = "20260722-1";

export function versioned(path) {
  return `${path}?v=${APP_VERSION}`;
}
