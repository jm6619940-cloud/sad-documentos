const icons = {
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  plus: "M12 5v14 M5 12h14",
  folder: "M3 7h7l2 2h9v10H3z",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v6l4 2",
  search: "M10 4a6 6 0 1 0 0 12a6 6 0 0 0 0-12z M15 15l5 5",
  users: "M16 11a4 4 0 1 0-8 0 M3 20a7 7 0 0 1 14 0 M19 8a3 3 0 0 1 0 6 M18 17a5 5 0 0 1 3 3",
  layers: "M12 3 3 8l9 5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  user: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  bell: "M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  logout: "M10 17l5-5-5-5 M15 12H3 M21 3v18h-8",
  upload: "M12 16V4 M7 9l5-5 5 5 M5 20h14",
  download: "M12 4v12 M7 11l5 5 5-5 M5 20h14",
  check: "M20 6 9 17l-5-5",
  x: "M6 6l12 12 M18 6 6 18",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z"
};

export function icon(name, label = "") {
  return `<svg class="icon" aria-hidden="${label ? "false" : "true"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[name] || icons.grid}"></path></svg>`;
}
