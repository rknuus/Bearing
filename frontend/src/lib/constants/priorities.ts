/** Short display labels for Eisenhower priority quadrants. */
export const priorityLabels: Record<string, string> = {
  'important-urgent': 'I&U',
  'not-important-urgent': 'nI&U',
  'important-not-urgent': 'I&nU',
};

/** Badge colors for Eisenhower priority quadrants. */
export const priorityColors: Record<string, string> = {
  'important-urgent': '#ef4444',      // Red
  'not-important-urgent': '#f59e0b',  // Amber
  'important-not-urgent': '#3b82f6',  // Blue
};
