/** Convierte el texto del calentamiento en pasos separados por flechas. */
export function parseWarmupSteps(warmupText) {
  if (!warmupText || !warmupText.trim()) return [];
  return warmupText
    .split(/\s*(?:→|->|=>)\s*/)
    .map((step) => step.trim())
    .filter(Boolean);
}
