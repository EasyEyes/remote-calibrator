/**
 * @fileoverview Markdown-based instruction parser for step-by-step instructions.
 *
 * This module provides an alternative parsing strategy to the custom token-based
 * parser (buildStepInstructions). It uses standard Markdown syntax to create
 * structured instruction models compatible with the existing rendering system.
 *
 * @module distance/markdownInstructionParser
 * @author Remote Calibrator Team
 * @version 1.0.0
 *
 * @example
 * import { buildStepInstructionsFromMarkdown } from './markdownInstructionParser.js'
 *
 * const markdown = `
 * # Setup Instructions
 *
 * 1. Find a stiff object 6-12 inches long
 * 2. Place it against the screen
 *    - Mark with your thumbnail
 *    - Press SPACE when ready
 *
 * ![Demo video](https://example.com/demo.mp4)
 * `
 *
 * const model = buildStepInstructionsFromMarkdown(markdown)
 * // Returns: { sections: [...], flatSteps: [...] }
 */

/**
 * @typedef {Object} InstructionStep
 * @property {string|null} number - Step number (e.g., "1", "2.1", null for bullets)
 * @property {string} text - HTML-formatted step text with Markdown features rendered
 * @property {number} level - Indentation level (0 = root, 1+ = nested)
 * @property {string[]} [mediaKeys] - Optional array of media reference keys
 * @property {string[]} [mediaUrls] - Optional array of media URLs
 */

/**
 * @typedef {Object} InstructionSection
 * @property {string} index - Section index as string (e.g., "0", "1", "2")
 * @property {string} title - Section title (from heading)
 * @property {InstructionStep[]} steps - Array of instruction steps
 * @property {string[]} mediaKeys - Section-level media reference keys
 * @property {string[]} mediaUrls - Section-level media URLs
 */

/**
 * @typedef {Object} FlatStep
 * @property {number} sectionIdx - Index into sections array
 * @property {number} stepIdx - Index into steps array within the section
 */

/**
 * @typedef {Object} InstructionModel
 * @property {InstructionSection[]} sections - Hierarchical sections and steps
 * @property {FlatStep[]} flatSteps - Flattened navigation index
 */

/**
 * Media file extensions supported by the parser.
 * @const {string[]}
 */
const MEDIA_EXTENSIONS = [
  'mp4',
  'mov',
  'webm',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
]

/**
 * Regular expression for matching media file extensions.
 * @const {RegExp}
 */
const MEDIA_EXTENSION_REGEX = new RegExp(
  `\\.(${MEDIA_EXTENSIONS.join('|')})([?#]|$)`,
  'i',
)

/**
 * Extracts media URLs from Markdown text and returns cleaned text.
 *
 * Supports:
 * - Image syntax: ![alt text](url)
 * - Link syntax to media: [text](media-url.mp4)
 * - Inline media references
 *
 * @private
 * @param {string} text - Text containing potential Markdown media references
 * @returns {{cleanText: string, urls: string[]}} Cleaned text and extracted URLs
 *
 * @example
 * extractMediaFromText('Step 1 ![demo](video.mp4) instructions')
 * // Returns: { cleanText: 'Step 1  instructions', urls: ['video.mp4'] }
 */
function extractMediaFromText(text) {
  const urls = []

  // Extract image syntax: ![alt](url)
  // Pattern handles URLs with balanced parentheses (one level deep)
  // e.g., "example.com/path(with)parens.mp4?query=value"
  // This fixes URLs like "Instruction%204%20(Revis%202).mp4" from being truncated at the first ")"
  let cleanText = text.replace(
    /!\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g,
    (match, alt, url) => {
      urls.push(url.trim())
      return '' // Remove from text
    },
  )

  // Extract link syntax pointing to media files: [text](media.mp4)
  // Updated to handle URLs containing parentheses
  cleanText = cleanText.replace(
    /\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g,
    (match, linkText, url) => {
      if (MEDIA_EXTENSION_REGEX.test(url)) {
        urls.push(url.trim())
        return linkText // Keep link text, remove link syntax
      }
      // Keep non-media links as HTML anchors
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${linkText}</a>`
    },
  )

  return { cleanText: cleanText.trim(), urls }
}

/**
 * Escapes HTML special characters to prevent XSS.
 *
 * @private
 * @param {string} text - Text to escape
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

/**
 * Processes inline Markdown formatting (bold, italic, code, headings, etc).
 *
 * This function is IDEMPOTENT - it's safe to call multiple times on the same text.
 * If the text already contains HTML tags from previous processing (strong, em, code,
 * del, h1-h6), it will be returned unchanged to prevent double-processing.
 *
 * Supports full standard Markdown inline syntax:
 * - # to ###### headings (at start of line)
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - `code`
 * - ~~strikethrough~~
 * - <br> or double-space line breaks
 * - Escape characters (\)
 *
 * @public
 * @param {string} text - Text with Markdown formatting
 * @returns {string} HTML-formatted text
 *
 * @example
 * processInlineFormatting('This is **bold** and *italic*')
 * // Returns: 'This is <strong>bold</strong> and <em>italic</em>'
 *
 * @example
 * processInlineFormatting('#### Heading 4\nSome text')
 * // Returns: '<h4>Heading 4</h4>\nSome text'
 *
 * @example
 * // Idempotent - safe to call twice
 * const once = processInlineFormatting('**bold**')
 * const twice = processInlineFormatting(once)
 * // once === twice === '<strong>bold</strong>'
 */
export function processInlineFormatting(text) {
  // Safety check: if text is not a string, return empty
  if (typeof text !== 'string') {
    return ''
  }

  // Idempotency check: skip if text already contains HTML tags from previous processing.
  // This prevents double-processing which would escape HTML entities incorrectly.
  // We check for tags that this function produces: strong, em, code, del, h1-h6
  if (/<(strong|em|code|del|h[1-6])\b/i.test(text)) {
    return text
  }

  return (
    text
      // Headings: # to ###### at start of line → <h1> to <h6>
      .replace(/^######\s+(.+)$/gm, '<h6 style="margin: 0.5em 0;">$1</h6>')
      .replace(/^#####\s+(.+)$/gm, '<h5 style="margin: 0.5em 0;">$1</h5>')
      .replace(/^####\s+(.+)$/gm, '<h4 style="margin: 0.5em 0;">$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3 style="margin: 0.5em 0;">$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2 style="margin: 0.5em 0;">$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1 style="margin: 0.5em 0;">$1</h1>')
      // Escape sequences: \* \_ \` etc. → preserve literal characters
      .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '&#92;$1')
      // Bold: **text** or __text__
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      // Code: `text`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Strikethrough: ~~text~~
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      // Line breaks: <br> or <br/> (HTML-style)
      .replace(/<br\s*\/?>/gi, '<br>')
      // Line breaks: double space + newline (Markdown-style)
      .replace(/  \n/g, '<br>')
  )
}

/**
 * Parses a single line as a list item.
 *
 * @private
 * @param {string} line - Line to parse
 * @returns {{indent: number, marker: string, content: string, isTask: boolean, taskChecked: boolean}|null} Parsed list item or null
 */
function parseListItem(line) {
  // Match numbered list: "1. text" or "  1. text"
  const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/)
  if (numberedMatch) {
    return {
      indent: numberedMatch[1].length,
      marker: numberedMatch[2],
      content: numberedMatch[3],
      isTask: false,
      taskChecked: false,
    }
  }

  // Match task list: "- [ ] text" or "- [x] text"
  const taskMatch = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.+)$/)
  if (taskMatch) {
    return {
      indent: taskMatch[1].length,
      marker: taskMatch[2],
      content: taskMatch[4],
      isTask: true,
      taskChecked: taskMatch[3].toLowerCase() === 'x',
    }
  }

  // Match bulleted list: "- text" or "  - text" or "* text"
  const bulletMatch = line.match(/^(\s*)([-*+])\s+(.+)$/)
  if (bulletMatch) {
    return {
      indent: bulletMatch[1].length,
      marker: bulletMatch[2],
      content: bulletMatch[3],
      isTask: false,
      taskChecked: false,
    }
  }

  return null
}

/**
 * Determines the nesting level based on indentation.
 *
 * @private
 * @param {number} indent - Number of leading spaces
 * @param {number} [spacesPerLevel=2] - Spaces per indentation level
 * @returns {number} Nesting level (0-based)
 */
function calculateNestingLevel(indent, spacesPerLevel = 2) {
  return Math.floor(indent / spacesPerLevel)
}

/**
 * Parses Markdown text into structured instruction model.
 *
 * This function converts Markdown-formatted instructions into a data structure
 * compatible with the existing renderStepInstructions system. It supports:
 *
 * - Headings (# and ##) as section titles
 * - Numbered lists (1., 2., etc.) as steps
 * - Bulleted lists (-, *, +) as steps without numbers
 * - Nested lists for sub-steps
 * - Inline formatting (bold, italic, code, strikethrough)
 * - Images: ![alt](url)
 * - Video links: [text](video.mp4)
 * - Regular links: [text](url)
 * - Media attachments at step or section level
 *
 * @public
 * @param {string} markdownText - Markdown-formatted instruction text
 * @param {Object} [options={}] - Parser options
 * @param {number} [options.spacesPerLevel=2] - Spaces per indentation level
 * @param {boolean} [options.strictMode=false] - Throw on parsing errors vs. graceful fallback
 * @returns {InstructionModel} Structured instruction model
 *
 * @throws {Error} If markdownText is not a string (in strict mode)
 *
 * @example
 * const markdown = `
 * # Getting Started
 *
 * 1. First step with **bold** text
 * 2. Second step with *italic* text
 *    - Nested sub-step
 *    - Another sub-step
 *
 * ![Demo](https://example.com/demo.mp4)
 *
 * ## Advanced Steps
 *
 * 1. Click the [Next Button](https://example.com)
 * 2. Watch the video below
 *
 * ![Tutorial](https://example.com/tutorial.mp4)
 * `
 *
 * const model = buildStepInstructionsFromMarkdown(markdown)
 * console.log(model.sections.length) // 2
 * console.log(model.flatSteps.length) // 4
 */
export function buildStepInstructionsFromMarkdown(markdownText, options = {}) {
  // Validate input
  if (typeof markdownText !== 'string') {
    const error = new Error(
      'buildStepInstructionsFromMarkdown: markdownText must be a string',
    )
    if (options.strictMode) {
      throw error
    }
    console.warn(error.message)
    return createEmptyModel()
  }

  const { spacesPerLevel = 2 } = options

  // Parse line by line
  const lines = markdownText.split(/\r?\n/)
  const sections = []
  let currentSection = null
  let pendingMedia = [] // Media found before being attached to a step/section
  let inCodeBlock = false
  let codeBlockLines = []
  let codeBlockLanguage = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd()

    // Handle code blocks: ```language
    const codeBlockMatch = line.match(/^```(\w*)/)
    if (codeBlockMatch) {
      if (!inCodeBlock) {
        // Start code block
        inCodeBlock = true
        codeBlockLanguage = codeBlockMatch[1] || ''
        codeBlockLines = []
      } else {
        // End code block
        inCodeBlock = false
        const codeContent = codeBlockLines.join('\n')
        const escapedCode = codeContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')

        if (!currentSection) {
          currentSection = {
            index: sections.length.toString(),
            title: '',
            steps: [],
            mediaKeys: [],
            mediaUrls: [],
          }
          sections.push(currentSection)
        }

        currentSection.steps.push({
          number: null,
          text: `<pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto;"><code>${escapedCode}</code></pre>`,
          level: 0,
          isCodeBlock: true,
        })
        codeBlockLines = []
      }
      continue
    }

    // If inside code block, collect lines
    if (inCodeBlock) {
      codeBlockLines.push(line)
      continue
    }

    // Skip empty lines
    if (!line.trim()) {
      continue
    }

    // Parse horizontal rules: ---, ***, ___
    const hrMatch = line.match(/^(\*{3,}|-{3,}|_{3,})\s*$/)
    if (hrMatch) {
      // Create a horizontal rule as a special step
      if (!currentSection) {
        currentSection = {
          index: sections.length.toString(),
          title: '',
          steps: [],
          mediaKeys: [],
          mediaUrls: [],
        }
        sections.push(currentSection)
      }
      currentSection.steps.push({
        number: null,
        text: '<hr style="border: 0; border-top: 1px solid #ddd; margin: 1rem 0;">',
        level: 0,
        isHr: true,
      })
      continue
    }

    // Parse blockquotes: > text
    const blockquoteMatch = line.match(/^>\s*(.+)$/)
    if (blockquoteMatch) {
      const quoteText = processInlineFormatting(blockquoteMatch[1])

      if (!currentSection) {
        currentSection = {
          index: sections.length.toString(),
          title: '',
          steps: [],
          mediaKeys: [],
          mediaUrls: [],
        }
        sections.push(currentSection)
      }

      // Check if previous step is also a blockquote to combine them
      const lastStep = currentSection.steps[currentSection.steps.length - 1]
      if (lastStep && lastStep.isBlockquote) {
        lastStep.text += `<br>${quoteText}`
      } else {
        currentSection.steps.push({
          number: null,
          text: `<blockquote style="border-left: 3px solid #ddd; padding-left: 1rem; margin: 0.5rem 0; color: #666;">${quoteText}</blockquote>`,
          level: 0,
          isBlockquote: true,
        })
      }
      continue
    }

    // Parse headings: # Title or ## Title
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = processInlineFormatting(headingMatch[2].trim())

      // Create new section
      currentSection = {
        index: sections.length.toString(),
        title,
        steps: [],
        mediaKeys: [],
        mediaUrls: [],
      }
      sections.push(currentSection)

      // Attach any pending media to this section
      if (pendingMedia.length > 0) {
        currentSection.mediaUrls.push(...pendingMedia)
        pendingMedia = []
      }

      continue
    }

    // Parse list items
    const listItem = parseListItem(line)
    if (listItem) {
      // Ensure we have a section
      if (!currentSection) {
        currentSection = {
          index: sections.length.toString(),
          title: '',
          steps: [],
          mediaKeys: [],
          mediaUrls: [],
        }
        sections.push(currentSection)
      }

      const { indent, marker, content, isTask, taskChecked } = listItem
      const level = calculateNestingLevel(indent, spacesPerLevel)

      // Extract media and format text
      const { cleanText, urls } = extractMediaFromText(content)
      const formattedText = processInlineFormatting(cleanText)

      // Build display text based on item type
      let displayText
      if (isTask) {
        // Task list: show checkbox
        const checkbox = taskChecked
          ? '<input type="checkbox" checked disabled style="margin-right: 0.5rem;">'
          : '<input type="checkbox" disabled style="margin-right: 0.5rem;">'
        displayText = `${checkbox}${formattedText}`
      } else if (/^\d+$/.test(marker)) {
        // Numbered: "1. text"
        displayText = `${marker}. ${formattedText}`
      } else {
        // Bullet: "- text"
        displayText = `${marker} ${formattedText}`
      }

      // Create step
      const step = {
        number: /^\d+$/.test(marker) ? marker : null,
        text: displayText,
        level,
        isTask,
        taskChecked,
      }

      // Attach media if present
      if (urls.length > 0) {
        step.mediaKeys = []
        step.mediaUrls = urls
      }

      currentSection.steps.push(step)

      // Attach any pending media to this step
      if (pendingMedia.length > 0) {
        step.mediaUrls = [...(step.mediaUrls || []), ...pendingMedia]
        pendingMedia = []
      }

      continue
    }

    // Parse standalone media lines
    const { urls } = extractMediaFromText(line)
    if (urls.length > 0) {
      if (currentSection && currentSection.steps.length > 0) {
        // Attach to last step
        const lastStep = currentSection.steps[currentSection.steps.length - 1]
        if (!lastStep.mediaUrls) {
          lastStep.mediaUrls = []
          lastStep.mediaKeys = []
        }
        lastStep.mediaUrls.push(...urls)
      } else if (currentSection) {
        // Attach to current section
        currentSection.mediaUrls.push(...urls)
      } else {
        // Hold for next section/step
        pendingMedia.push(...urls)
      }
      continue
    }

    // Parse plain text paragraphs (attach to previous step or create new step)
    const plainText = line.trim()
    if (plainText) {
      if (currentSection && currentSection.steps.length > 0) {
        // Append to last step
        const lastStep = currentSection.steps[currentSection.steps.length - 1]
        const formattedText = processInlineFormatting(plainText)
        lastStep.text += `\n${formattedText}`
      } else {
        // Create implicit section/step for orphaned text
        if (!currentSection) {
          currentSection = {
            index: sections.length.toString(),
            title: '',
            steps: [],
            mediaKeys: [],
            mediaUrls: [],
          }
          sections.push(currentSection)
        }

        const formattedText = processInlineFormatting(plainText)
        currentSection.steps.push({
          number: null,
          text: formattedText,
          level: 0,
        })
      }
    }
  }

  // Fallback: create default section if nothing was parsed
  if (sections.length === 0) {
    sections.push({
      index: '0',
      title: '',
      steps: [
        {
          number: null,
          text: processInlineFormatting(markdownText),
          level: 0,
        },
      ],
      mediaKeys: [],
      mediaUrls: [],
    })
  }

  // Build flattened step index for navigation
  const flatSteps = buildFlatStepIndex(sections)

  return { sections, flatSteps }
}

/**
 * Builds flattened navigation index from sections.
 *
 * @private
 * @param {InstructionSection[]} sections - Parsed sections
 * @returns {FlatStep[]} Flattened step references
 */
function buildFlatStepIndex(sections) {
  const flatSteps = []
  sections.forEach((section, sectionIdx) => {
    section.steps.forEach((_, stepIdx) => {
      flatSteps.push({ sectionIdx, stepIdx })
    })
  })
  return flatSteps
}

/**
 * Creates an empty instruction model (fallback).
 *
 * @private
 * @returns {InstructionModel} Empty model
 */
function createEmptyModel() {
  return {
    sections: [
      {
        index: '0',
        title: '',
        steps: [],
        mediaKeys: [],
        mediaUrls: [],
      },
    ],
    flatSteps: [],
  }
}

/**
 * Validates that a model has the correct structure.
 *
 * Useful for testing and debugging.
 *
 * @public
 * @param {*} model - Model to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 *
 * @example
 * const model = buildStepInstructionsFromMarkdown(markdown)
 * const { valid, errors } = validateInstructionModel(model)
 * if (!valid) {
 *   console.error('Invalid model:', errors)
 * }
 */
export function validateInstructionModel(model) {
  const errors = []

  if (!model || typeof model !== 'object') {
    errors.push('Model must be an object')
    return { valid: false, errors }
  }

  if (!Array.isArray(model.sections)) {
    errors.push('Model must have sections array')
  }

  if (!Array.isArray(model.flatSteps)) {
    errors.push('Model must have flatSteps array')
  }

  if (model.sections) {
    model.sections.forEach((section, idx) => {
      if (typeof section.title !== 'string') {
        errors.push(`Section ${idx}: title must be string`)
      }
      if (!Array.isArray(section.steps)) {
        errors.push(`Section ${idx}: steps must be array`)
      }
      if (!Array.isArray(section.mediaUrls)) {
        errors.push(`Section ${idx}: mediaUrls must be array`)
      }
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Converts legacy token-based text to Markdown.
 *
 * Provides a migration path from the old [[TT]], [[SS]], [[LL]] format.
 *
 * @public
 * @param {string} tokenText - Text with legacy tokens
 * @param {Object} [linkMap={}] - Asset map for resolving [[LL]] references
 * @returns {string} Markdown-formatted text
 *
 * @example
 * const legacy = `[[TT1]]
 * [[SS1]] Step one
 * [[LL1]]
 * [[SS2]] Step two`
 *
 * const markdown = convertLegacyTokensToMarkdown(legacy, { LL1: 'video.mp4' })
 * // Returns: '# \n\n1. Step one\n\n![](video.mp4)\n\n2. Step two'
 */
export function convertLegacyTokensToMarkdown(tokenText, linkMap = {}) {
  if (typeof tokenText !== 'string') {
    return ''
  }

  const lines = tokenText.split(/\r?\n/)
  const output = []
  let stepCounter = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Title: [[TTn]]
    if (/^\[\[TT\d+\]\]/.test(trimmed)) {
      const titleText = trimmed.replace(/^\[\[TT\d+\]\]\s*/, '')
      output.push(`# ${titleText}`)
      output.push('') // Blank line
      continue
    }

    // Link: [[LLn]]
    const linkMatch = trimmed.match(/^\[\[LL(\d+)\]\]$/)
    if (linkMatch) {
      const key = `LL${linkMatch[1]}`
      const url = linkMap[key] || linkMap[key.toLowerCase()] || ''
      if (url) {
        output.push(`![](${url})`)
        output.push('') // Blank line
      }
      continue
    }

    // Step: [[SSn]] text
    const stepMatch = trimmed.match(/^\[\[SS[\d.]+\]\]\s*(.*)$/)
    if (stepMatch) {
      stepCounter++
      output.push(`${stepCounter}. ${stepMatch[1]}`)
      continue
    }

    // Plain text
    output.push(trimmed)
  }

  return output.join('\n')
}
