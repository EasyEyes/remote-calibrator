/**
 * @fileoverview Adapter for switching between legacy and Markdown parsers.
 * 
 * This module provides a unified interface for parsing instructions,
 * automatically detecting the format and using the appropriate parser.
 * 
 * @module distance/instructionParserAdapter
 * @author Remote Calibrator Team
 * @version 1.0.0
 */

import { buildStepInstructions } from './stepByStepInstructionHelps.js'
import { 
  buildStepInstructionsFromMarkdown,
  validateInstructionModel 
} from './markdownInstructionParser.js'

/**
 * Instruction format types.
 * @enum {string}
 */
export const InstructionFormat = {
  /** Legacy token-based format with [[TT]], [[SS]], [[LL]] */
  LEGACY: 'legacy',
  /** Modern Markdown-based format */
  MARKDOWN: 'markdown',
  /** Automatically detect format */
  AUTO: 'auto',
}

/**
 * Detects the instruction format from text content.
 * 
 * Detection rules:
 * 1. If text contains [[TT or [[SS tokens → Legacy format
 * 2. If text contains Markdown headings (#) or lists (1., -) → Markdown format
 * 3. Otherwise → Legacy format (fallback)
 * 
 * @private
 * @param {string} text - Instruction text to analyze
 * @returns {InstructionFormat} Detected format
 * 
 * @example
 * detectInstructionFormat('[[TT1]]\n[[SS1]] Step') // 'legacy'
 * detectInstructionFormat('# Title\n1. Step') // 'markdown'
 */
function detectInstructionFormat(text) {
  if (typeof text !== 'string') {
    return InstructionFormat.LEGACY
  }
  
  // Check for legacy tokens (strong indicator)
  if (/\[\[TT\d+\]\]|\[\[SS[\d.]+\]\]|\[\[LL\d+\]\]/i.test(text)) {
    return InstructionFormat.LEGACY
  }
  
  // Check for Markdown patterns
  const hasMarkdownHeading = /^#{1,6}\s+.+$/m.test(text)
  const hasMarkdownList = /^\s*(\d+\.|-|\*|\+)\s+.+$/m.test(text)
  
  if (hasMarkdownHeading || hasMarkdownList) {
    return InstructionFormat.MARKDOWN
  }
  
  // Default to legacy for backward compatibility
  return InstructionFormat.LEGACY
}

/**
 * Parses instruction text using the appropriate parser.
 * 
 * This is the main entry point for parsing instructions. It automatically
 * detects the format (or uses a specified format) and delegates to the
 * correct parser implementation.
 * 
 * @public
 * @param {string} text - Instruction text to parse
 * @param {Object} [options={}] - Parser options
 * @param {InstructionFormat} [options.format='auto'] - Force specific format or auto-detect
 * @param {Object} [options.assetMap={}] - Asset map for legacy format (LL token resolution)
 * @param {number} [options.spacesPerLevel=2] - Markdown: spaces per indentation level
 * @param {boolean} [options.strictMode=false] - Throw on errors vs. graceful fallback
 * @param {boolean} [options.validate=false] - Validate output model structure
 * @returns {Object} Instruction model with sections and flatSteps
 * 
 * @example
 * // Auto-detect format
 * const model = parseInstructions(phraseText)
 * 
 * @example
 * // Force Markdown parsing
 * const model = parseInstructions(phraseText, { format: InstructionFormat.MARKDOWN })
 * 
 * @example
 * // Legacy format with asset map
 * const model = parseInstructions(phraseText, {
 *   format: InstructionFormat.LEGACY,
 *   assetMap: distanceCalibrationAssetMap
 * })
 */
export function parseInstructions(text, options = {}) {
  const {
    format = InstructionFormat.AUTO,
    assetMap = {},
    spacesPerLevel = 2,
    strictMode = false,
    validate = false,
  } = options
  
  // Validate input
  if (typeof text !== 'string') {
    console.error('parseInstructions: text must be a string')
    return createEmptyModel()
  }
  
  // Determine format
  const actualFormat = format === InstructionFormat.AUTO 
    ? detectInstructionFormat(text)
    : format
  
  // Parse using appropriate parser
  let model
  try {
    if (actualFormat === InstructionFormat.MARKDOWN) {
      model = buildStepInstructionsFromMarkdown(text, { 
        spacesPerLevel, 
        strictMode 
      })
    } else {
      model = buildStepInstructions(text, assetMap)
    }
  } catch (error) {
    console.error(`parseInstructions: Parsing failed (${actualFormat} format)`, error)
    return createEmptyModel()
  }
  
  // Validate if requested
  if (validate) {
    const { valid, errors } = validateInstructionModel(model)
    if (!valid) {
      console.warn('parseInstructions: Model validation failed', errors)
    }
  }
  
  return model
}

/**
 * Creates an empty instruction model (fallback).
 * 
 * @private
 * @returns {Object} Empty model
 */
function createEmptyModel() {
  return {
    sections: [
      {
        index: '0',
        title: '',
        steps: [],
        mediaKeys: [],
        mediaUrls: []
      }
    ],
    flatSteps: []
  }
}

/**
 * Checks if a phrase uses Markdown format.
 * 
 * Convention: Phrase keys ending with '_MD' are Markdown format.
 * 
 * @public
 * @param {string} phraseKey - Phrase key to check
 * @returns {boolean} True if Markdown format
 * 
 * @example
 * isMarkdownPhrase('RC_Instructions_MD') // true
 * isMarkdownPhrase('RC_Instructions') // false
 */
export function isMarkdownPhrase(phraseKey) {
  return typeof phraseKey === 'string' && phraseKey.endsWith('_MD')
}

/**
 * Gets instruction model from phrases system.
 * 
 * Convenience function that handles phrase lookup, format detection,
 * and parsing in one call.
 * 
 * @public
 * @param {Object} phrases - Phrases object
 * @param {string} phraseKey - Phrase key
 * @param {string} language - Language code (e.g., 'en', 'es')
 * @param {Object} [options={}] - Parser options (same as parseInstructions)
 * @returns {Object} Instruction model
 * 
 * @example
 * const model = getInstructionModel(
 *   phrases,
 *   'RC_UseObjectToSetViewingDistanceTapePage1',
 *   'en',
 *   { assetMap: distanceCalibrationAssetMap }
 * )
 */
export function getInstructionModel(phrases, phraseKey, language, options = {}) {
  // Get text from phrases
  const phrase = phrases[phraseKey]
  if (!phrase) {
    console.error(`getInstructionModel: Phrase not found: ${phraseKey}`)
    return createEmptyModel()
  }
  
  const text = phrase[language] || phrase.en || ''
  if (!text) {
    console.error(`getInstructionModel: No text for language '${language}' in ${phraseKey}`)
    return createEmptyModel()
  }
  
  // Auto-detect format if using _MD suffix convention
  const detectedFormat = isMarkdownPhrase(phraseKey)
    ? InstructionFormat.MARKDOWN
    : InstructionFormat.AUTO
  
  // Parse
  return parseInstructions(text, {
    ...options,
    format: options.format || detectedFormat
  })
}

/**
 * Performance metrics for parser comparison.
 * 
 * @public
 * @param {string} text - Text to parse
 * @param {Object} [options={}] - Parser options
 * @returns {Object} Performance metrics
 * 
 * @example
 * const metrics = measureParserPerformance(phraseText, { assetMap })
 * console.log('Parse time:', metrics.parseTimeMs, 'ms')
 * console.log('Model size:', metrics.totalSteps, 'steps')
 */
export function measureParserPerformance(text, options = {}) {
  const startTime = performance.now()
  const model = parseInstructions(text, options)
  const endTime = performance.now()
  
  const totalSteps = model.flatSteps.length
  const totalSections = model.sections.length
  const stepsWithMedia = model.sections.reduce((count, section) => {
    return count + section.steps.filter(step => 
      step.mediaUrls && step.mediaUrls.length > 0
    ).length
  }, 0)
  
  return {
    parseTimeMs: (endTime - startTime).toFixed(3),
    totalSections,
    totalSteps,
    stepsWithMedia,
    avgTimePerStep: totalSteps > 0 
      ? ((endTime - startTime) / totalSteps).toFixed(3)
      : 0,
    model,
  }
}

/**
 * Compares legacy and Markdown parsers side-by-side.
 * 
 * Useful for testing and migration validation.
 * 
 * @public
 * @param {string} legacyText - Legacy format text
 * @param {string} markdownText - Markdown format text (equivalent content)
 * @param {Object} [assetMap={}] - Asset map for legacy parser
 * @returns {Object} Comparison results
 * 
 * @example
 * const comparison = compareParserOutputs(legacyText, markdownText, assetMap)
 * console.log('Steps match:', comparison.stepCountMatch)
 * console.log('Performance delta:', comparison.performanceDelta)
 */
export function compareParserOutputs(legacyText, markdownText, assetMap = {}) {
  const legacyMetrics = measureParserPerformance(legacyText, {
    format: InstructionFormat.LEGACY,
    assetMap,
  })
  
  const markdownMetrics = measureParserPerformance(markdownText, {
    format: InstructionFormat.MARKDOWN,
  })
  
  return {
    legacy: legacyMetrics,
    markdown: markdownMetrics,
    stepCountMatch: legacyMetrics.totalSteps === markdownMetrics.totalSteps,
    sectionCountMatch: legacyMetrics.totalSections === markdownMetrics.totalSections,
    performanceDelta: (
      parseFloat(markdownMetrics.parseTimeMs) - parseFloat(legacyMetrics.parseTimeMs)
    ).toFixed(3),
    fasterParser: parseFloat(markdownMetrics.parseTimeMs) < parseFloat(legacyMetrics.parseTimeMs)
      ? 'markdown'
      : 'legacy',
  }
}

