interface PhotoZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TemplatePositions {
  photoZones: PhotoZone[];
}

// Hardcoded photo zone positions in pixels
const NEWSPAPER_POSITIONS: TemplatePositions = {
  photoZones: [
    { x: 150, y: 1049, width: 3203, height: 1464 },
    { x: 135, y: 3026, width: 1725, height: 1063 },
    { x: 2053, y: 3027, width: 1315, height: 1054 },
  ],
};

// Hardcoded positions by template name (in pixels)
export const TEMPLATE_POSITIONS: Record<string, TemplatePositions> = {
  'Main Template': NEWSPAPER_POSITIONS,
  'newspaper': NEWSPAPER_POSITIONS,
  'Newspaper': NEWSPAPER_POSITIONS,
};

export function getHardcodedPositions(templateName: string): TemplatePositions | null {
  return TEMPLATE_POSITIONS[templateName] || null;
}
