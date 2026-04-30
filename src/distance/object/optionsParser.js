/**
 * optionsParser.js
 *
 * Pure functions for parsing and normalizing objectTest options.
 * Handles unit conversion, paper label parsing, and paper/ruler
 * selection option building.
 *
 * Faithfully reproduces the logic from legacy distance.js lines 3578-3714.
 */

import {
  UNIT_TO_CM_FACTOR,
  PAPER_ONLY_FALLBACK_OPTIONS,
  PAPER_AND_RULER_FALLBACK_OPTIONS,
} from './objectTestConstants'
import { debugWarn } from './debugLogger'

/**
 * Map of paper choice labels to explicit length overrides.
 * Labels not in this map fall through to parseLengthCmFromLabel.
 *
 * Legacy: distance.js lines 3581-3585
 */
const PAPER_CHOICE_LENGTH_MAP = {
  'None of the above': null,
}

/**
 * Convert a unit string to its centimeter multiplier.
 *
 * Legacy: distance.js lines 3587-3595
 *
 * @param {string} unitRaw - Unit string (e.g. 'cm', 'mm', 'in', 'inch', 'inches')
 * @returns {number|null} Multiplier to convert to cm, or null if unrecognized
 */
export function unitToCmFactor(unitRaw) {
  const unit = String(unitRaw || '')
    .trim()
    .toLowerCase()
  return UNIT_TO_CM_FACTOR[unit] ?? null
}

/**
 * Parse a physical length in centimeters from a label string.
 * Tries parenthesized dimensions first, then bare measurements.
 *
 * Legacy: distance.js lines 3597-3641
 *
 * @param {string} labelRaw - Label text (e.g. 'A4 (210 × 297 mm)', '24 inch ruler')
 * @returns {number|null} Length in cm, or null if unparseable
 */
export function parseLengthCmFromLabel(labelRaw) {
  const label = String(labelRaw || '').trim()
  if (!label) return null

  const parenMatch = label.match(/\(([^)]+)\)/)
  if (parenMatch && parenMatch[1]) {
    const inside = parenMatch[1]
    const dimMatch = inside.match(
      /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|inches?|inch|in)\b/i,
    )
    if (dimMatch) {
      const a = Number(dimMatch[1])
      const b = Number(dimMatch[2])
      const factor = unitToCmFactor(dimMatch[3])
      if (Number.isFinite(a) && Number.isFinite(b) && factor) {
        return Math.max(a, b) * factor
      }
    }

    const singleInside = inside.match(
      /(\d+(?:\.\d+)?)\s*(mm|cm|inches?|inch|in)\b/i,
    )
    if (singleInside) {
      const v = Number(singleInside[1])
      const factor = unitToCmFactor(singleInside[2])
      if (Number.isFinite(v) && factor) return v * factor
    }
  }

  const singleMatch = label.match(
    /(\d+(?:\.\d+)?)\s*(mm|cm|inches?|inch|in)\b/i,
  )
  if (singleMatch) {
    const v = Number(singleMatch[1])
    const factor = unitToCmFactor(singleMatch[2])
    if (Number.isFinite(v) && factor) return v * factor
  }

  return null
}

/**
 * Build paper/ruler selection options from a raw newline-delimited phrase string.
 * Parses lengths from a matching English phrase when provided, while preserving
 * the localized phrase text as the display label.
 *
 * Legacy: distance.js lines 3643-3668
 *
 * @param {string} rawChoices - Newline-separated list of choice labels
 * @param {number[]} fallbackLengths - Positional fallback lengths in cm
 * @param {string} rawLengthChoices - Newline-separated English labels for parsing lengths
 * @returns {Array<{key: string, label: string, lengthCm: number|null}>|null}
 */
export function buildPaperSelectionOptions(
  rawChoices,
  fallbackLengths,
  rawLengthChoices = rawChoices,
) {
  try {
    const lines = (rawChoices || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length)
    if (!lines.length) return null
    const lengthLines = (rawLengthChoices || rawChoices || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length)

    return lines.map((label, idx) => {
      const lengthLabel = lengthLines[idx] || label
      const lengthCm = (() => {
        if (lengthLabel in PAPER_CHOICE_LENGTH_MAP) {
          return PAPER_CHOICE_LENGTH_MAP[lengthLabel]
        }
        const parsed = parseLengthCmFromLabel(lengthLabel)
        if (parsed !== null) return parsed
        return fallbackLengths?.[idx] ?? null
      })()
      return {
        key: `paper-${idx}`,
        label,
        lengthCm,
      }
    })
  } catch (e) {
    debugWarn('optionsParser', 'Failed to build paper choices from phrases:', e)
    return null
  }
}

/**
 * Resolve the paper selection options for the current mode.
 * Determines whether to use paper-only or paper+ruler choices,
 * fetches the phrase text, and falls back to hardcoded defaults.
 *
 * Legacy: distance.js lines 3670-3713
 *
 * @param {object} params
 * @param {boolean} params.isPaperSelectionModeBool - Whether paper selection mode is active
 * @param {boolean} params.calibrateDistanceCheckBool - Whether distance check is enabled
 * @param {object} params.phrases - The i18n phrases object
 * @param {string} params.lang - Current language code
 * @returns {{
 *   paperSelectionOptions: Array<{key: string, label: string, lengthCm: number|null}>,
 *   usePaperOnlyChoicesBool: boolean,
 *   paperChoicesPhraseKey: string,
 * }}
 */
export function resolvePaperSelectionOptions({
  isPaperSelectionModeBool,
  calibrateDistanceCheckBool,
  phrases,
  lang,
}) {
  const usePaperOnlyChoicesBool =
    isPaperSelectionModeBool && calibrateDistanceCheckBool === true
  const paperChoicesPhraseKey = usePaperOnlyChoicesBool
    ? 'RC_PaperChoices'
    : 'RC_PaperAndRulerChoices'
  const rawPaperChoices = phrases?.[paperChoicesPhraseKey]?.[lang] || ''
  const rawEnglishPaperChoices =
    phrases?.[paperChoicesPhraseKey]?.en || rawPaperChoices

  const fallbackLengths = (
    usePaperOnlyChoicesBool
      ? PAPER_ONLY_FALLBACK_OPTIONS
      : PAPER_AND_RULER_FALLBACK_OPTIONS
  ).map(o => o.lengthCm)

  const paperSelectionOptions =
    buildPaperSelectionOptions(
      rawPaperChoices,
      fallbackLengths,
      rawEnglishPaperChoices,
    ) ||
    (usePaperOnlyChoicesBool
      ? PAPER_ONLY_FALLBACK_OPTIONS
      : PAPER_AND_RULER_FALLBACK_OPTIONS)

  return {
    paperSelectionOptions,
    usePaperOnlyChoicesBool,
    paperChoicesPhraseKey,
  }
}
