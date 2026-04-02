export const RUN_COLORS = [
  '#3B82F6', // blue
  '#F97316', // orange
  '#8B5CF6', // violet
  '#10B981', // emerald
  '#EF4444', // red
  '#F59E0B', // amber
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#84CC16', // lime
  '#6366F1', // indigo
];

let colorIndex = 0;

export function nextRunColor(): string {
  const color = RUN_COLORS[colorIndex % RUN_COLORS.length];
  colorIndex++;
  return color;
}

export function resetColorIndex(): void {
  colorIndex = 0;
}
