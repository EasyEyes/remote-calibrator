/**
 * paperSelectionComponent.js
 *
 * Encapsulates the paper-selection UI that was previously inlined in the legacy
 * objectTest function (distance.js ~L4647-5042).  The component creates a
 * full-screen overlay, a card with radio-button options, a step-by-step
 * instruction stepper, a suggestion text-input, and a "DON'T USE RULER" note.
 *
 * All DOM element IDs, classes, inline styles, attributes, and event-handler
 * semantics are identical to the legacy implementation.
 */

import { DOM_ID, Z_INDEX } from './objectTestConstants'
import { debugLog, debugWarn } from './debugLogger'

/**
 * @typedef {Object} PaperSelectionConfig
 * @property {Object}   RC                        - RemoteCalibrator instance
 * @property {Object}   phrases                   - Internationalised phrase map
 * @property {Object}   options                   - Calibration options bag
 * @property {Array<{key:string,label:string,lengthCm:number|null}>} paperSelectionOptions
 * @property {boolean}  usePaperOnlyChoicesBool   - Whether only paper (no ruler) choices are shown
 * @property {string}   paperInstructionsPhraseKey - Phrase key for the title text
 * @property {Function} parseInstructions         - Parses markdown instruction text into a model
 * @property {Function} renderStepInstructions    - Renders a step-instruction model into DOM elements
 * @property {Function} resolveInstructionMediaUrl - Resolves media asset URLs
 * @property {Function} processInlineFormatting   - Converts markdown-like inline formatting to HTML
 * @property {Object}   [test_assetMap]           - Optional asset map for instruction parsing
 */

/**
 * @typedef {Object} PaperSelectionComponent
 * @property {function(HTMLElement):void} mount               - Appends all elements to the given container
 * @property {function():void}           show                 - Shows the overlay + selection UI
 * @property {function():void}           hide                 - Hides the overlay + selection UI
 * @property {function():string|null}    getSelectedOption    - Returns the selected option key
 * @property {function():string}         getSuggestionValue   - Returns the suggestion input value
 * @property {function():void}           reset                - Clears selection and suggestion state
 * @property {function():void}           initStepper          - (Re-)initialises the RC_UseLongEdge stepper
 * @property {function():void}           renderStepperView    - Re-renders the current stepper step
 * @property {function(KeyboardEvent):void} handleStepperNav  - Keydown handler for ArrowUp/ArrowDown
 * @property {function():void}           cleanup              - Removes global listeners and detaches DOM
 * @property {Object}                    elements             - Direct references to key DOM nodes
 */

/**
 * Creates the paper-selection UI component.
 *
 * @param {PaperSelectionConfig} config
 * @returns {PaperSelectionComponent}
 */
export function createPaperSelectionComponent(config) {
  const {
    RC,
    phrases,
    options,
    paperSelectionOptions,
    usePaperOnlyChoicesBool,
    paperInstructionsPhraseKey,
    parseInstructions,
    renderStepInstructions,
    resolveInstructionMediaUrl,
    processInlineFormatting,
    test_assetMap,
  } = config

  // ── Selection state ────────────────────────────────────────────────────────
  let selectedPaperOption = null
  let selectedPaperLengthCm = null
  let selectedPaperLabel = null

  // ── Stepper state ──────────────────────────────────────────────────────────
  let paperStepInstructionModel = null
  let paperCurrentStepFlatIndex = 0

  // ── Callbacks that the host can wire up after creation ─────────────────────
  let _onSelectionChange = null

  // ══════════════════════════════════════════════════════════════════════════
  //  Radio overlay (semi-transparent backdrop)
  // ══════════════════════════════════════════════════════════════════════════
  const radioOverlay = document.createElement('div')
  radioOverlay.style.position = 'fixed'
  radioOverlay.style.top = '0'
  radioOverlay.style.left = '0'
  radioOverlay.style.width = '100%'
  radioOverlay.style.height = '100%'
  radioOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)'
  radioOverlay.style.zIndex = Z_INDEX.RADIO_OVERLAY
  radioOverlay.style.display = 'none'

  // ══════════════════════════════════════════════════════════════════════════
  //  Paper selection container
  // ══════════════════════════════════════════════════════════════════════════
  const paperSelectionContainer = document.createElement('div')
  paperSelectionContainer.id = DOM_ID.PAPER_SELECTION_CONTAINER
  paperSelectionContainer.style.position = 'relative'
  paperSelectionContainer.style.display = 'none'
  paperSelectionContainer.style.flexDirection = 'column'
  paperSelectionContainer.style.alignItems = 'flex-start'
  paperSelectionContainer.style.justifyContent = 'flex-start'
  paperSelectionContainer.style.backgroundColor = 'transparent'
  paperSelectionContainer.style.zIndex = Z_INDEX.PAPER_SELECTION
  paperSelectionContainer.style.color = '#111'
  paperSelectionContainer.style.padding = '0'
  paperSelectionContainer.style.paddingLeft = 'clamp(1rem, 5vw, 3rem)'
  paperSelectionContainer.style.paddingRight = '1rem'
  paperSelectionContainer.style.paddingTop = '0.1rem'
  paperSelectionContainer.style.paddingBottom = '1rem'
  paperSelectionContainer.style.boxSizing = 'border-box'
  paperSelectionContainer.style.width = '50vw'
  paperSelectionContainer.style.maxWidth = '50vw'
  paperSelectionContainer.style.maxHeight = 'calc(100vh - 5rem)'
  paperSelectionContainer.style.overflowY = 'auto'
  paperSelectionContainer.style.overflowX = 'hidden'

  // ══════════════════════════════════════════════════════════════════════════
  //  Card wrapper
  // ══════════════════════════════════════════════════════════════════════════
  const paperSelectionCard = document.createElement('div')
  paperSelectionCard.style.maxWidth = '100%'
  paperSelectionCard.style.width = '100%'
  paperSelectionCard.style.background = 'transparent'
  paperSelectionCard.style.border = 'none'
  paperSelectionCard.style.borderRadius = '0'
  paperSelectionCard.style.padding = '0'
  paperSelectionCard.style.boxSizing = 'border-box'
  paperSelectionCard.style.boxShadow = 'none'
  paperSelectionCard.style.display = 'flex'
  paperSelectionCard.style.flexDirection = 'column'
  paperSelectionCard.style.minHeight = '0'
  paperSelectionCard.style.flexGrow = '1'

  // ── Title ──────────────────────────────────────────────────────────────────
  const paperSelectionTitle = document.createElement('div')
  paperSelectionTitle.innerHTML = processInlineFormatting(
    phrases[paperInstructionsPhraseKey]?.[RC.L] || '',
  )
  paperSelectionTitle.style.fontSize = 'clamp(1rem, 3vmin, 1.4rem)'
  paperSelectionTitle.style.fontWeight = '600'
  paperSelectionTitle.style.color = '#111'
  paperSelectionTitle.style.textAlign = 'left'
  paperSelectionTitle.style.margin =
    'clamp(0.5rem, 3vmin, 2rem) 0px clamp(0.5rem, 2vmin, 1rem) 0px'

  // ── Options list ───────────────────────────────────────────────────────────
  const paperOptionsList = document.createElement('div')
  paperOptionsList.style.display = 'flex'
  paperOptionsList.style.flexDirection = 'column'
  paperOptionsList.style.gap = 'clamp(0.3rem, 1.5vmin, 0.7rem)'
  paperOptionsList.style.alignItems = 'flex-start'

  // ══════════════════════════════════════════════════════════════════════════
  //  Stepper (step-by-step instruction UI for RC_UseLongEdge)
  // ══════════════════════════════════════════════════════════════════════════
  const paperStepperContainer = document.createElement('div')
  paperStepperContainer.style.marginTop = 'clamp(0.75rem, 4vmin, 3rem)'
  paperStepperContainer.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  paperStepperContainer.style.lineHeight = '1.4'
  paperStepperContainer.style.color = '#555'
  paperStepperContainer.style.width = '100%'
  paperStepperContainer.style.maxWidth = '100%'
  paperStepperContainer.style.pointerEvents = 'auto'

  const paperStepperLeftText = document.createElement('div')
  paperStepperLeftText.style.pointerEvents = 'auto'
  paperStepperLeftText.style.textAlign =
    RC.LD === RC._CONST.RTL ? 'right' : 'left'

  const paperStepperRightText = document.createElement('div')
  paperStepperRightText.style.pointerEvents = 'auto'

  // Media container lives outside paperSelectionContainer (right half of screen)
  const paperStepperMediaContainer = document.createElement('div')
  paperStepperMediaContainer.id = DOM_ID.PAPER_STEPPER_MEDIA
  paperStepperMediaContainer.style.position = 'fixed'
  paperStepperMediaContainer.style.top = '50%'
  paperStepperMediaContainer.style.transform = 'translateY(-50%)'
  if (RC.LD === RC._CONST.RTL) {
    paperStepperMediaContainer.style.left = '0'
    paperStepperMediaContainer.style.right = 'auto'
  } else {
    paperStepperMediaContainer.style.right = '0'
    paperStepperMediaContainer.style.left = 'auto'
  }
  paperStepperMediaContainer.style.width = '50vw'
  paperStepperMediaContainer.style.height = 'auto'
  paperStepperMediaContainer.style.maxHeight = '80vh'
  paperStepperMediaContainer.style.display = 'none'
  paperStepperMediaContainer.style.zIndex = Z_INDEX.PAPER_STEPPER_MEDIA
  paperStepperMediaContainer.style.padding = '1rem'
  paperStepperMediaContainer.style.boxSizing = 'border-box'
  paperStepperMediaContainer.style.pointerEvents = 'none'

  paperStepperContainer.appendChild(paperStepperLeftText)
  paperStepperContainer.appendChild(paperStepperRightText)

  // ── Stepper render ─────────────────────────────────────────────────────────
  const renderPaperStepperView = () => {
    if (!paperStepInstructionModel) {
      paperStepperLeftText.innerHTML = ''
      paperStepperRightText.innerHTML = ''
      paperStepperMediaContainer.innerHTML = ''
      return
    }

    const maxIdx = (paperStepInstructionModel?.flatSteps?.length || 1) - 1

    const handlePaperPrev = () => {
      if (paperCurrentStepFlatIndex > 0) {
        paperCurrentStepFlatIndex--
      }
      renderPaperStepperView()
    }

    const handlePaperNext = () => {
      if (paperCurrentStepFlatIndex < maxIdx) {
        paperCurrentStepFlatIndex++
      }
      renderPaperStepperView()
    }

    renderStepInstructions({
      model: paperStepInstructionModel,
      flatIndex: paperCurrentStepFlatIndex,
      elements: {
        leftText: paperStepperLeftText,
        rightText: paperStepperRightText,
        mediaContainer: paperStepperMediaContainer,
      },
      options: {
        calibrateDistanceCheckBool: options.calibrateDistanceCheckBool,
        thresholdFraction: 0.6,
        useCurrentSectionOnly: true,
        resolveMediaUrl: resolveInstructionMediaUrl,
        stepperHistory: options.stepperHistory,
        onPrev: handlePaperPrev,
        onNext: handlePaperNext,
        layout: 'twoColumn',
      },
      lang: RC.language.value,
      langDirection: RC.LD,
      phrases: phrases,
    })
  }

  // ── Stepper initialisation ─────────────────────────────────────────────────
  const initPaperStepper = () => {
    try {
      const useLongEdgeRaw = phrases.RC_UseLongEdge?.[RC.L] || ''
      const normalizedText = useLongEdgeRaw
        .replaceAll('/n', '\n')
        .replaceAll('\\n', '\n')

      paperStepInstructionModel = parseInstructions(normalizedText, {
        format: 'markdown',
        assetMap: test_assetMap,
      })
      paperCurrentStepFlatIndex = 0
      renderPaperStepperView()
    } catch (e) {
      debugWarn(
        'paperSelection',
        'Failed to parse RC_UseLongEdge as step instructions; using plain text',
        e,
      )
      paperStepInstructionModel = null
      const useLongEdgeRaw = phrases.RC_UseLongEdge?.[RC.L] || ''
      paperStepperLeftText.innerHTML = processInlineFormatting(
        useLongEdgeRaw.replaceAll('/n', '<br>').replaceAll('\\n', '<br>'),
      )
      paperStepperLeftText.style.whiteSpace = 'pre-line'
    }
  }

  initPaperStepper()

  // ── Keyboard navigation (ArrowUp / ArrowDown) ─────────────────────────────
  /**
   * Handles ArrowUp/ArrowDown for the paper stepper.
   * The caller is responsible for gating on page number and paper-selection
   * mode; this handler only checks focus and model state.
   *
   * @param {KeyboardEvent} e
   */
  const handlePaperStepperNav = e => {
    if (!paperStepInstructionModel) return

    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA')
      return
    if (
      document.activeElement &&
      document.activeElement.tagName === 'INPUT' &&
      !['radio', 'checkbox'].includes(document.activeElement.type)
    )
      return

    if (e.key === 'ArrowDown') {
      const maxIdx = (paperStepInstructionModel.flatSteps?.length || 1) - 1
      if (paperCurrentStepFlatIndex < maxIdx) {
        paperCurrentStepFlatIndex++
      }
      renderPaperStepperView()
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (paperCurrentStepFlatIndex > 0) {
        paperCurrentStepFlatIndex--
      }
      renderPaperStepperView()
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Suggestion input
  // ══════════════════════════════════════════════════════════════════════════
  const paperSuggestionWrapper = document.createElement('div')
  paperSuggestionWrapper.style.display = 'flex'
  paperSuggestionWrapper.style.flexDirection = 'column'
  paperSuggestionWrapper.style.gap = 'clamp(0.2rem, 1vmin, 0.35rem)'
  paperSuggestionWrapper.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'

  const paperSuggestionLabel = document.createElement('div')
  paperSuggestionLabel.innerHTML = processInlineFormatting(
    phrases.RC_SuggestObject?.[RC.L] || '',
  )
  paperSuggestionLabel.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  paperSuggestionLabel.style.lineHeight = '1.3'
  paperSuggestionLabel.style.color = '#555'

  const paperSuggestionInput = document.createElement('input')
  paperSuggestionInput.type = 'text'
  paperSuggestionInput.placeholder = phrases.RC_SuggestObjectHere[RC.L]
  paperSuggestionInput.style.fontSize = '1rem'
  paperSuggestionInput.style.padding = '10px 12px'
  paperSuggestionInput.style.border = '1px solid rgba(85, 85, 85, 0.9)'
  paperSuggestionInput.style.borderRadius = '10px'
  paperSuggestionInput.style.width = '320px'
  paperSuggestionInput.style.maxWidth = '90vw'
  paperSuggestionInput.style.outline = 'none'
  paperSuggestionInput.style.background = 'transparent'
  paperSuggestionInput.style.pointerEvents = 'auto'
  paperSuggestionInput.style.userSelect = 'text'

  let paperSuggestionValue = ''
  paperSuggestionInput.oninput = e => {
    paperSuggestionValue = e.target.value || ''
  }
  paperSuggestionInput.addEventListener('keydown', e => {
    e.stopPropagation()
  })
  paperSuggestionInput.addEventListener('click', e => e.stopPropagation())

  paperSuggestionWrapper.appendChild(paperSuggestionLabel)
  paperSuggestionWrapper.appendChild(paperSuggestionInput)

  // ══════════════════════════════════════════════════════════════════════════
  //  "DON'T USE RULER" note — fixed in upper-right (or upper-left for RTL)
  // ══════════════════════════════════════════════════════════════════════════
  const dontUseYourRulerNote = document.createElement('div')
  dontUseYourRulerNote.id = DOM_ID.DONT_USE_RULER_NOTE
  const dontUseYourRulerRaw = phrases.RC_DontUseYourRulerYet?.[RC.L] || ''
  dontUseYourRulerNote.innerHTML = processInlineFormatting(
    dontUseYourRulerRaw.replaceAll('/n', '<br>').replaceAll('\\n', '<br>'),
  )
  dontUseYourRulerNote.style.position = 'fixed'
  dontUseYourRulerNote.style.top = '12px'
  dontUseYourRulerNote.style.zIndex = Z_INDEX.DONT_USE_RULER
  dontUseYourRulerNote.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  dontUseYourRulerNote.style.lineHeight = '1.4'
  dontUseYourRulerNote.style.color = '#555'
  dontUseYourRulerNote.style.whiteSpace = 'pre-line'
  dontUseYourRulerNote.style.maxWidth = '45vw'
  dontUseYourRulerNote.style.pointerEvents = 'none'
  dontUseYourRulerNote.style.userSelect = 'none'
  if (RC.LD === RC._CONST.RTL) {
    dontUseYourRulerNote.style.left = '12px'
    dontUseYourRulerNote.style.right = 'auto'
    dontUseYourRulerNote.style.textAlign = 'left'
  } else {
    dontUseYourRulerNote.style.right = '12px'
    dontUseYourRulerNote.style.left = 'auto'
    dontUseYourRulerNote.style.textAlign = 'right'
  }
  dontUseYourRulerNote.style.display =
    options.calibrateDistanceCheckBool === true &&
    dontUseYourRulerRaw.trim().length
      ? 'block'
      : 'none'

  // ══════════════════════════════════════════════════════════════════════════
  //  Important warning + validation message
  // ══════════════════════════════════════════════════════════════════════════
  const paperImportantWarning = document.createElement('div')
  paperImportantWarning.textContent = ''
  paperImportantWarning.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'
  paperImportantWarning.style.fontSize = 'clamp(0.9rem, 2.5vmin, 1.3rem)'
  paperImportantWarning.style.lineHeight = '1.4'
  paperImportantWarning.style.color = '#111'

  const paperValidationMessage = document.createElement('div')
  paperValidationMessage.style.color = '#ff9f43'
  paperValidationMessage.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'
  paperValidationMessage.style.display = 'none'
  paperValidationMessage.style.fontSize = 'clamp(0.8rem, 2vmin, 0.95rem)'

  // ══════════════════════════════════════════════════════════════════════════
  //  Option row factory
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Creates a single radio-button option row.
   *
   * @param {{key:string, label:string, lengthCm:number|null}} option
   * @returns {HTMLLabelElement}
   */
  const createPaperOptionRow = option => {
    const row = document.createElement('label')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '1px'
    row.style.cursor = 'pointer'
    row.style.fontSize = 'clamp(1rem, 2.5vmin, 1.3rem)'
    row.style.lineHeight = '1.2'
    row.style.color = '#111'
    row.style.textAlign = 'left'
    row.style.padding = '0'

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'paper-selection'
    radio.value = option.key
    radio.style.cursor = 'pointer'
    radio.style.marginRight = '0.5rem'
    radio.style.padding = '0'
    radio.style.width = 'clamp(14px, 3vmin, 16px)'
    radio.style.height = 'clamp(14px, 3vmin, 16px)'
    radio.style.flexShrink = '0'
    radio.onchange = () => {
      selectedPaperOption = option.key
      selectedPaperLengthCm = option.lengthCm
      selectedPaperLabel = option.label.replace(/<[^>]*>/g, '')
      paperValidationMessage.style.display = 'none'
      if (_onSelectionChange) {
        _onSelectionChange({
          key: selectedPaperOption,
          lengthCm: selectedPaperLengthCm,
          label: selectedPaperLabel,
        })
      }
    }

    const labelSpan = document.createElement('span')
    labelSpan.innerHTML = option.label
    labelSpan.style.fontSize = 'clamp(1rem, 2.5vmin, 1.3rem)'

    row.appendChild(radio)
    row.appendChild(labelSpan)

    return row
  }

  // Populate option rows
  paperSelectionOptions.forEach(opt => {
    const row = createPaperOptionRow(opt)
    paperOptionsList.appendChild(row)
  })

  // ══════════════════════════════════════════════════════════════════════════
  //  Assemble card hierarchy
  // ══════════════════════════════════════════════════════════════════════════
  paperSelectionCard.appendChild(paperSelectionTitle)
  paperSelectionCard.appendChild(paperOptionsList)
  paperSelectionCard.appendChild(paperStepperContainer)
  paperSelectionCard.appendChild(paperSuggestionWrapper)
  paperSelectionCard.appendChild(paperImportantWarning)
  paperSelectionCard.appendChild(paperValidationMessage)
  paperSelectionContainer.appendChild(paperSelectionCard)

  // ══════════════════════════════════════════════════════════════════════════
  //  Public API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Appends all component elements to the given container.
   * The dontUseYourRulerNote is appended to document.body (fixed positioning),
   * and the media container is appended directly to the container (not inside
   * paperSelectionContainer) so it can occupy the right half of the screen.
   *
   * @param {HTMLElement} container
   */
  const mount = container => {
    container.appendChild(radioOverlay)
    container.appendChild(paperStepperMediaContainer)
    container.appendChild(paperSelectionContainer)
    document.body.appendChild(dontUseYourRulerNote)
    debugLog('paperSelection', 'Mounted paper selection component')
  }

  const show = () => {
    radioOverlay.style.display = 'block'
    paperSelectionContainer.style.display = 'flex'
  }

  const hide = () => {
    radioOverlay.style.display = 'none'
    paperSelectionContainer.style.display = 'none'
  }

  /** @returns {string|null} The key of the currently selected option. */
  const getSelectedOption = () => selectedPaperOption

  /** @returns {number|null} The length in cm of the currently selected option. */
  const getSelectedLengthCm = () => selectedPaperLengthCm

  /** @returns {string|null} The display label of the currently selected option. */
  const getSelectedLabel = () => selectedPaperLabel

  /** @returns {string} Current value of the suggestion text input. */
  const getSuggestionValue = () => paperSuggestionValue

  /** Clears all selection and suggestion state, unchecks radio buttons. */
  const reset = () => {
    selectedPaperOption = null
    selectedPaperLengthCm = null
    selectedPaperLabel = null
    paperSuggestionValue = ''
    paperSuggestionInput.value = ''
    paperValidationMessage.style.display = 'none'
    const radios = paperOptionsList.querySelectorAll('input[type="radio"]')
    radios.forEach(r => {
      r.checked = false
    })
  }

  /** Removes the global keydown listener and detaches DOM nodes. */
  const cleanup = () => {
    radioOverlay.remove()
    paperSelectionContainer.remove()
    paperStepperMediaContainer.remove()
    dontUseYourRulerNote.remove()
    debugLog('paperSelection', 'Cleaned up paper selection component')
  }

  return {
    mount,
    show,
    hide,
    getSelectedOption,
    getSelectedLengthCm,
    getSelectedLabel,
    getSuggestionValue,
    reset,
    initStepper: initPaperStepper,
    renderStepperView: renderPaperStepperView,
    handleStepperNav: handlePaperStepperNav,
    cleanup,

    /** Register a callback invoked whenever the user picks an option. */
    set onSelectionChange(fn) {
      _onSelectionChange = fn
    },

    elements: {
      radioOverlay,
      paperSelectionContainer,
      paperSelectionCard,
      paperSelectionTitle,
      paperOptionsList,
      paperStepperContainer,
      paperStepperLeftText,
      paperStepperRightText,
      paperStepperMediaContainer,
      paperSuggestionWrapper,
      paperSuggestionLabel,
      paperSuggestionInput,
      dontUseYourRulerNote,
      paperImportantWarning,
      paperValidationMessage,
    },
  }
}
