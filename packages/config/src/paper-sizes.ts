/**
 * Paper size configuration for photo booth printing
 *
 * All dimensions are calculated at 300 DPI (dots per inch)
 * Standard formula: millimeters × 300 / 25.4 = pixels
 */

// ============================================================================
// Types
// ============================================================================

export type PaperSize = 'A3' | 'A4' | 'CUSTOM';

export interface PaperSizeConfig {
  size: PaperSize;
  width: number;      // pixels at 300 DPI
  height: number;     // pixels at 300 DPI
  widthMm: number;    // millimeters
  heightMm: number;   // millimeters
}

// ============================================================================
// Standard Paper Size Configurations
// ============================================================================

/**
 * Standard paper size configurations (portrait orientation)
 *
 * A3: 297mm × 420mm = 3508px × 4960px @ 300 DPI
 * A4: 210mm × 297mm = 2480px × 3508px @ 300 DPI
 */
export const PAPER_SIZE_CONFIGS: Record<Exclude<PaperSize, 'CUSTOM'>, PaperSizeConfig> = {
  A3: {
    size: 'A3',
    width: 3508,
    height: 4960,
    widthMm: 297,
    heightMm: 420,
  },
  A4: {
    size: 'A4',
    width: 2480,
    height: 3508,
    widthMm: 210,
    heightMm: 297,
  },
};

/**
 * Default tolerance (in pixels) for paper size detection
 * Allows ±50px difference to account for minor variations
 */
export const DEFAULT_TOLERANCE = 50;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Detect paper size from canvas dimensions
 *
 * Checks if the given dimensions match any standard paper size
 * (within the specified tolerance). Returns 'CUSTOM' if no match found.
 *
 * Handles both portrait and landscape orientations automatically.
 *
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param tolerance - Tolerance in pixels for matching (default: 50)
 * @returns Detected paper size ('A3', 'A4', or 'CUSTOM')
 *
 * @example
 * detectPaperSize(3508, 4960); // Returns 'A3'
 * detectPaperSize(4960, 3508); // Returns 'A3' (landscape)
 * detectPaperSize(2480, 3508); // Returns 'A4'
 * detectPaperSize(3000, 4000); // Returns 'CUSTOM'
 */
export function detectPaperSize(
  width: number,
  height: number,
  tolerance: number = DEFAULT_TOLERANCE
): PaperSize {
  // Try each standard paper size
  for (const config of Object.values(PAPER_SIZE_CONFIGS)) {
    // Check portrait orientation
    if (
      Math.abs(width - config.width) <= tolerance &&
      Math.abs(height - config.height) <= tolerance
    ) {
      return config.size;
    }

    // Check landscape orientation
    if (
      Math.abs(width - config.height) <= tolerance &&
      Math.abs(height - config.width) <= tolerance
    ) {
      return config.size;
    }
  }

  // No match found
  return 'CUSTOM';
}

/**
 * Validate if dimensions match the declared paper size
 *
 * Checks if the given dimensions are appropriate for the declared
 * paper size. Returns validation result with error message if invalid.
 *
 * @param paperSize - Declared paper size
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param tolerance - Tolerance in pixels (default: 50)
 * @returns Validation result with optional error message
 *
 * @example
 * validatePaperSizeMatch('A3', 3508, 4960);
 * // Returns { valid: true }
 *
 * validatePaperSizeMatch('A4', 3508, 4960);
 * // Returns {
 * //   valid: false,
 * //   message: 'Dimensions (3508×4960px) do not match A4 paper size (2480×3508px)'
 * // }
 */
export function validatePaperSizeMatch(
  paperSize: PaperSize,
  width: number,
  height: number,
  tolerance: number = DEFAULT_TOLERANCE
): { valid: boolean; message?: string } {
  // CUSTOM always validates (by definition)
  if (paperSize === 'CUSTOM') {
    return { valid: true };
  }

  const config = PAPER_SIZE_CONFIGS[paperSize];

  // Check portrait orientation
  const portraitMatch =
    Math.abs(width - config.width) <= tolerance &&
    Math.abs(height - config.height) <= tolerance;

  // Check landscape orientation
  const landscapeMatch =
    Math.abs(width - config.height) <= tolerance &&
    Math.abs(height - config.width) <= tolerance;

  if (portraitMatch || landscapeMatch) {
    return { valid: true };
  }

  return {
    valid: false,
    message: `Dimensions (${width}×${height}px) do not match ${paperSize} paper size (${config.width}×${config.height}px)`,
  };
}

/**
 * Get display label for paper size
 *
 * Returns a human-readable label describing the paper size and dimensions.
 *
 * @param paperSize - Paper size type
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @returns Display label string
 *
 * @example
 * getPaperSizeLabel('A3', 3508, 4960);
 * // Returns "A3 (3508×4960px)"
 *
 * getPaperSizeLabel('CUSTOM', 3000, 4000);
 * // Returns "Custom (3000×4000px)"
 */
export function getPaperSizeLabel(
  paperSize: PaperSize,
  width: number,
  height: number
): string {
  if (paperSize === 'CUSTOM') {
    return `Custom (${width}×${height}px)`;
  }

  return `${paperSize} (${width}×${height}px)`;
}

/**
 * Get paper size configuration by size
 *
 * Returns the full configuration for a standard paper size.
 * Returns null for CUSTOM sizes.
 *
 * @param paperSize - Paper size type
 * @returns Paper size configuration or null
 *
 * @example
 * getPaperSizeConfig('A4');
 * // Returns { size: 'A4', width: 2480, height: 3508, widthMm: 210, heightMm: 297 }
 *
 * getPaperSizeConfig('CUSTOM');
 * // Returns null
 */
export function getPaperSizeConfig(
  paperSize: PaperSize
): PaperSizeConfig | null {
  if (paperSize === 'CUSTOM') {
    return null;
  }

  return PAPER_SIZE_CONFIGS[paperSize];
}

/**
 * Convert paper size to printer media option string
 *
 * Returns the appropriate media string for printer commands.
 * Used for Linux/macOS printing with lp/lpr commands.
 *
 * @param paperSize - Paper size type
 * @param platform - Operating system platform (default: 'linux')
 * @returns Media option string for printer command
 *
 * @example
 * getPrinterMediaOption('A3', 'linux');
 * // Returns "A3"
 *
 * getPrinterMediaOption('A4', 'darwin');
 * // Returns "iso_a4_210x297mm"
 *
 * getPrinterMediaOption('CUSTOM', 'linux');
 * // Returns "A3" (fallback)
 */
export function getPrinterMediaOption(
  paperSize: PaperSize,
  platform: 'linux' | 'darwin' | 'win32' = 'linux'
): string {
  // CUSTOM always falls back to A3
  const effectiveSize = paperSize === 'CUSTOM' ? 'A3' : paperSize;

  if (platform === 'darwin') {
    // macOS uses ISO format strings
    return effectiveSize === 'A3'
      ? 'iso_a3_297x420mm'
      : 'iso_a4_210x297mm';
  }

  // Linux uses simple size names
  return effectiveSize;
}

/**
 * Check if dimensions are landscape orientation
 *
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @returns True if landscape (width > height)
 */
export function isLandscape(width: number, height: number): boolean {
  return width > height;
}

/**
 * Get orientation string for dimensions
 *
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @returns 'landscape' or 'portrait'
 */
export function getOrientation(width: number, height: number): 'landscape' | 'portrait' {
  return isLandscape(width, height) ? 'landscape' : 'portrait';
}
