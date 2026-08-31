export const CATEGORY_COLORS: Record<string, string> = {
  Music: "#ff4f9a",
  Entertainment: "#9b6dff",
  Gaming: "#31b7ff",
  "Film & Animation": "#ff9d47",
  Sports: "#42d392",
  Comedy: "#ffd166",
  News: "#ff6464",
  "News & Politics": "#ff6464",
  Education: "#4dd4c6",
  "People & Blogs": "#e879f9",
};

export function getCategoryColor(category?: string): string {
  if (!category) {
    return "#5a6b8c";
  }

  if (CATEGORY_COLORS[category]) {
    return CATEGORY_COLORS[category];
  }

  let hash = 0;

  for (const character of category) {
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  }

  return `hsl(${Math.abs(hash) % 360} 70% 60%)`;
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
