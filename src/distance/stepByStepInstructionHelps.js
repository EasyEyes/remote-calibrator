import { processInlineFormatting } from './markdownInstructionParser.js'

export function buildStepInstructions(phraseText, linkMap = {}) {
  if (typeof phraseText !== 'string') {
    throw new Error('buildStepInstructions: phraseText must be a string')
  }
  const lines = phraseText.split(/\r?\n/)
  const sections = []
  let currentSection = null
  let expectingTitle = false

  const getLinkUrl = key => {
    // key can be like 'LL1' or just '1'
    const normKey = /^LL/.test(key) ? key : `LL${key}`
    return linkMap[normKey] || linkMap[normKey.toUpperCase()] || ''
  }

  for (let raw of lines) {
    const line = raw.trim()
    if (!line) continue

    // Title marker: [[TTn]] (supports inline title text on same line)
    const tt =
      line.match(/^\[\[TT(\d+(?:\.\d+)*)\]\]\s*(.*)$/i) ||
      line.match(/^\[\[TT(\d+(?:\.\d+)*)\]\]$/i)
    if (tt) {
      currentSection = {
        index: tt[1],
        title: '',
        steps: [],
        mediaKeys: [],
        mediaUrls: [],
      }
      sections.push(currentSection)
      const inlineTitle = tt[2]
      if (inlineTitle && inlineTitle.trim().length > 0) {
        currentSection.title = inlineTitle.trim()
        expectingTitle = false
      } else {
        expectingTitle = true
      }
      continue
    }

    // Link marker: [[LLn]]
    const ll = line.match(/^\[\[LL(\d+)\]\]$/i)
    if (ll) {
      const key = `LL${ll[1]}`
      currentSection = currentSection || {
        index: '0',
        title: '',
        steps: [],
        mediaKeys: [],
        mediaUrls: [],
      }
      if (!sections.includes(currentSection)) {
        sections.push(currentSection)
      }
      // If there is a current step, attach media to that step; otherwise, attach to section
      const lastStep =
        currentSection.steps && currentSection.steps.length > 0
          ? currentSection.steps[currentSection.steps.length - 1]
          : null
      if (lastStep) {
        if (!lastStep.mediaKeys) lastStep.mediaKeys = []
        if (!lastStep.mediaUrls) lastStep.mediaUrls = []
        lastStep.mediaKeys.push(key)
        const url = getLinkUrl(key)
        if (url) lastStep.mediaUrls.push(url)
      } else {
        currentSection.mediaKeys.push(key)
        const url = getLinkUrl(key)
        if (url) currentSection.mediaUrls.push(url)
      }
      continue
    }

    // Step marker: [[SSn]] text...
    const ss = line.match(/^\[\[SS(\d+(?:\.\d+)*)\]\]\s*(.*)$/i)
    if (ss) {
      const number = ss[1]
      let text = ss[2] || ''
      currentSection = currentSection || {
        index: '0',
        title: '',
        steps: [],
        mediaKeys: [],
        mediaUrls: [],
      }
      if (!sections.includes(currentSection)) {
        sections.push(currentSection)
      }
      const level = (number.match(/\./g) || []).length
      // Extract any inline [[LLn]] tokens from the step's text
      const inlineMediaKeys = []
      text = text.replace(/\[\[LL(\d+)\]\]/gi, (_, n) => {
        inlineMediaKeys.push(`LL${n}`)
        return ''
      })
      const step = {
        number,
        text: text.trim(),
        level,
      }
      if (inlineMediaKeys.length > 0) {
        step.mediaKeys = []
        step.mediaUrls = []
        inlineMediaKeys.forEach(k => {
          step.mediaKeys.push(k)
          const u = getLinkUrl(k)
          if (u) step.mediaUrls.push(u)
        })
      }
      currentSection.steps.push(step)
      expectingTitle = false
      continue
    }

    // Plain text: if expecting title after [[TTn]], treat as title; otherwise ignore
    if (expectingTitle && currentSection) {
      currentSection.title = line
      expectingTitle = false
      continue
    }

    // Other non-token plain text: include as a step in current section
    if (currentSection) {
      // Initialize section if somehow missing (safety)
      if (!sections.includes(currentSection)) {
        sections.push(currentSection)
      }
      // If there is a previous step, append this line to it so it shows at the same time
      if (currentSection.steps.length > 0) {
        const prev = currentSection.steps[currentSection.steps.length - 1]
        prev.text = prev.text ? `${prev.text}\n${line}` : line
      } else {
        // No previous step: create a new step at base level
        currentSection.steps.push({
          number: null,
          text: line,
          level: 0,
        })
      }
      continue
    }
  }

  if (sections.length === 0) {
    // Fallback: single section with everything as one step
    sections.push({
      index: '0',
      title: '',
      steps: [{ number: '1', text: phraseText }],
      mediaKeys: [],
      mediaUrls: [],
    })
  }

  // Build flattened order of steps for simple navigation
  const flatSteps = []
  sections.forEach((sec, sIdx) => {
    sec.steps.forEach((_, stepIdx) => {
      flatSteps.push({ sectionIdx: sIdx, stepIdx })
    })
  })

  return { sections, flatSteps }
}

// UI builder for step-by-step instructions
export function createStepInstructionsUI(parent, options = {}) {
  const {
    leftWidth = '50%',
    rightWidth = '50%',
    leftPaddingStart = '3rem',
    leftPaddingEnd = '1rem',
    rightPaddingStart = '1rem',
    rightPaddingEnd = '3rem',
    fontSize = 'clamp(1.1em, 2.5vw, 1.4em)',
    lineHeight = '1.4',
    layout = 'twoColumn', // 'twoColumn' | 'leftOnly'
    mediaAlignment = 'auto', // 'top' | 'center' | 'bottom' | 'auto'
    mediaPositionMode = 'flow', // 'flow' | 'viewport'
    langDirection = 'LTR', // 'LTR' | 'RTL' - needed for viewport positioning
    mediaZIndex = '2147483600', // z-index for viewport-positioned media (below button at 2147483647)
  } = options

  const wrapper = document.createElement('div')
  wrapper.style.display = layout === 'twoColumn' ? 'flex' : 'block'
  if (layout === 'twoColumn') wrapper.style.flexDirection = 'row'
  wrapper.style.width = '100%'
  wrapper.style.maxWidth = '100%'
  // Enable pointer events so stepper is clickable even when ancestor has pointer-events: none
  wrapper.style.pointerEvents = 'auto'
  parent.appendChild(wrapper)

  const leftColumn = document.createElement('div')
  leftColumn.style.width = leftWidth
  leftColumn.style.maxWidth = leftWidth
  leftColumn.style.paddingInlineStart = leftPaddingStart
  leftColumn.style.paddingInlineEnd = leftPaddingEnd
  leftColumn.style.textAlign = 'start'
  leftColumn.style.fontSize = fontSize
  leftColumn.style.lineHeight = lineHeight
  // Enable pointer events so stepper is clickable even when ancestor has pointer-events: none
  leftColumn.style.pointerEvents = 'auto'
  const leftText = document.createElement('div')
  leftText.style.whiteSpace = 'pre-line'
  leftText.style.wordBreak = 'break-word'
  leftText.style.overflowWrap = 'anywhere'
  // Enable pointer events so stepper is clickable even when ancestor has pointer-events: none
  leftText.style.pointerEvents = 'auto'
  leftColumn.appendChild(leftText)
  wrapper.appendChild(leftColumn)

  let rightColumn = null
  let rightText = null
  const mediaContainer = document.createElement('div')
  mediaContainer.style.marginTop = '0.8rem' // Reduced by 20% to prevent video occlusion
  mediaContainer.style.display = 'block'
  mediaContainer.style.width = '100%'

  if (layout === 'twoColumn') {
    rightColumn = document.createElement('div')
    rightColumn.style.width = rightWidth
    rightColumn.style.maxWidth = rightWidth
    rightColumn.style.paddingInlineStart = rightPaddingStart
    rightColumn.style.paddingInlineEnd = rightPaddingEnd
    rightColumn.style.textAlign = 'start'
    rightColumn.style.fontSize = fontSize
    rightColumn.style.lineHeight = lineHeight
    // Enable pointer events so stepper is clickable even when ancestor has pointer-events: none
    rightColumn.style.pointerEvents = 'auto'
    rightText = document.createElement('div')
    rightText.style.whiteSpace = 'pre-line'
    rightText.style.wordBreak = 'break-word'
    rightText.style.overflowWrap = 'anywhere'
    // Enable pointer events so stepper is clickable even when ancestor has pointer-events: none
    rightText.style.pointerEvents = 'auto'
    rightColumn.appendChild(rightText)
    wrapper.appendChild(rightColumn)

    // Viewport mode: media is fixed-positioned relative to viewport
    if (mediaPositionMode === 'viewport') {
      mediaContainer.style.position = 'fixed'
      mediaContainer.style.width = '50vw'
      mediaContainer.style.maxWidth = '50vw'
      mediaContainer.style.marginTop = '0'
      mediaContainer.style.padding = '1rem'
      mediaContainer.style.boxSizing = 'border-box'
      // Use z-index below the button container (2147483647) but above most content
      mediaContainer.style.zIndex = mediaZIndex
      mediaContainer.style.pointerEvents = 'none' // Don't block clicks

      // Horizontal position: right half for LTR, left half for RTL
      if (langDirection === 'RTL') {
        mediaContainer.style.left = '0'
        mediaContainer.style.right = 'auto'
      } else {
        mediaContainer.style.right = '0'
        mediaContainer.style.left = 'auto'
      }

      // Vertical position based on mediaAlignment
      if (mediaAlignment === 'top') {
        mediaContainer.style.top = '0'
        mediaContainer.style.bottom = 'auto'
        mediaContainer.style.transform = 'none'
      } else if (mediaAlignment === 'center' || mediaAlignment === 'auto') {
        mediaContainer.style.top = '50%'
        mediaContainer.style.bottom = 'auto'
        mediaContainer.style.transform = 'translateY(-50%)'
      } else if (mediaAlignment === 'bottom') {
        mediaContainer.style.top = 'auto'
        mediaContainer.style.bottom = '0'
        mediaContainer.style.transform = 'none'
      }

      // Append to document.body for viewport positioning
      document.body.appendChild(mediaContainer)
    } else {
      // Flow mode: media is in normal document flow within right column
      if (mediaAlignment !== 'auto') {
        rightColumn.style.display = 'flex'
        rightColumn.style.flexDirection = 'column'
        rightColumn.style.height = '100%'
        rightText.style.flex = '0 0 auto'

        if (mediaAlignment === 'top') {
          mediaContainer.style.marginTop = '0'
          mediaContainer.style.flex = '0 0 auto'
        } else if (mediaAlignment === 'center') {
          mediaContainer.style.marginTop = 'auto'
          mediaContainer.style.marginBottom = 'auto'
          mediaContainer.style.flex = '0 0 auto'
        } else if (mediaAlignment === 'bottom') {
          mediaContainer.style.marginTop = 'auto'
          mediaContainer.style.flex = '0 0 auto'
        }
      }
      rightColumn.appendChild(mediaContainer)
    }
  } else {
    // leftOnly layout: media goes under the left text inside left column
    leftColumn.style.display = 'flex'
    leftColumn.style.flexDirection = 'column'
    leftText.style.flex = '0 0 auto'
    leftColumn.appendChild(mediaContainer)
  }

  // Track if media was appended to body for cleanup
  const mediaInViewportMode =
    layout === 'twoColumn' && mediaPositionMode === 'viewport'

  return {
    wrapper,
    leftColumn,
    rightColumn,
    leftText,
    rightText,
    mediaContainer,
    destroy: () => {
      try {
        parent.removeChild(wrapper)
      } catch {}
      // Also remove viewport-positioned media container from body
      if (mediaInViewportMode) {
        try {
          document.body.removeChild(mediaContainer)
        } catch {}
      }
    },
  }
}

// Create a Stepper UI anchored relative to a reference element in the DOM.
// The Stepper container is absolutely positioned and inserted into document.body,
// either below or above the reference element's bounding rect.
export function createAnchoredStepperUI(referenceEl, options = {}) {
  if (!referenceEl || typeof referenceEl.getBoundingClientRect !== 'function') {
    throw new Error('createAnchoredStepperUI: referenceEl is required')
  }
  const {
    placement = 'below', // 'below' | 'above' | 'inside-bottom' | 'inside-top'
    offsetPx = 8,
    positionMode = 'absolute', // 'absolute' | 'fixed'
    // When true, disables ALL internal positioning (initial, resize, scroll, ResizeObserver).
    // Caller must handle positioning manually. Use this when the reference element's
    // getBoundingClientRect() returns stale/incorrect values during initialization.
    disableInternalPositioning = false,
    // Pass-through styling/layout options for the inner Stepper UI
    leftWidth = '100%',
    rightWidth = '0%',
    leftPaddingStart = '0.75rem',
    leftPaddingEnd = '0.75rem',
    rightPaddingStart = '0rem',
    rightPaddingEnd = '0rem',
    fontSize = 'clamp(1.05em, 2.2vw, 1.35em)',
    lineHeight = '1.4',
    layout = 'leftOnly',
  } = options

  const anchored = document.createElement('div')
  anchored.style.position = positionMode // absolute relative to document or fixed to viewport
  anchored.style.zIndex = '2000000000000' // high above content but below overlays that use higher z
  anchored.style.pointerEvents = 'auto'
  anchored.style.visibility = 'hidden' // hide until positioned
  document.body.appendChild(anchored)

  // Build the inner stepper UI inside the anchored container
  const inner = createStepInstructionsUI(anchored, {
    leftWidth,
    rightWidth,
    leftPaddingStart,
    leftPaddingEnd,
    rightPaddingStart,
    rightPaddingEnd,
    fontSize,
    lineHeight,
    layout,
  })

  const computeAndApplyPosition = () => {
    const rect = referenceEl.getBoundingClientRect()
    // Determine left and width
    const pageX = window.pageXOffset || document.documentElement.scrollLeft || 0
    const pageY = window.pageYOffset || document.documentElement.scrollTop || 0
    const leftViewport = rect.left
    const topViewport = rect.top
    const bottomViewport = rect.bottom
    const width = rect.width
    // Set container width to match reference
    anchored.style.width = `${Math.max(0, Math.floor(width))}px`
    // Choose coordinate system
    const leftPx =
      positionMode === 'absolute' ? leftViewport + pageX : leftViewport
    let topPx =
      placement === 'below'
        ? bottomViewport + offsetPx
        : placement === 'inside-top'
          ? topViewport + offsetPx
          : topViewport - offsetPx

    if (placement === 'inside-bottom') {
      topPx = bottomViewport - offsetPx
    }

    topPx = positionMode === 'absolute' ? topPx + pageY : topPx

    // If placement is 'above' or 'inside-bottom', we need the actual height to avoid overlap (or to align to bottom).
    // Temporarily make visible to measure, then adjust top.
    anchored.style.visibility = 'hidden'
    anchored.style.left = `${Math.round(leftPx)}px`
    anchored.style.top = `${Math.round(topPx)}px`
    // Force layout
    void anchored.offsetWidth
    if (placement === 'above') {
      const h = anchored.offsetHeight || 0
      const adjustedTop =
        (positionMode === 'absolute' ? topViewport + pageY : topViewport) -
        h -
        offsetPx
      anchored.style.top = `${Math.round(adjustedTop)}px`
    } else if (placement === 'inside-bottom') {
      const h = anchored.offsetHeight || 0
      const adjustedTop =
        (positionMode === 'absolute'
          ? bottomViewport + pageY
          : bottomViewport) -
        h -
        offsetPx
      anchored.style.top = `${Math.round(adjustedTop)}px`
    } else if (placement === 'inside-top') {
      const adjustedTop =
        (positionMode === 'absolute' ? topViewport + pageY : topViewport) +
        offsetPx
      anchored.style.top = `${Math.round(adjustedTop)}px`
    }
    anchored.style.visibility = 'visible'
  }

  const reposition = () => {
    try {
      computeAndApplyPosition()
    } catch {}
  }

  // Internal positioning uses getBoundingClientRect() which can return stale values.
  // When disableInternalPositioning is true, caller handles all positioning manually.
  let resizeObserver = null
  let onResize = null
  let onScroll = null

  if (!disableInternalPositioning) {
    // Initial position after one frame (ensure inner is rendered)
    requestAnimationFrame(reposition)

    // Keep in sync on resize and scroll
    onResize = () => reposition()
    onScroll = () => reposition()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })

    // If the inner content size changes, reposition (for 'above' placement)
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => reposition())
      })
      resizeObserver.observe(anchored)
    }
  }

  const destroy = () => {
    try {
      if (onResize) window.removeEventListener('resize', onResize)
      if (onScroll) window.removeEventListener('scroll', onScroll)
      if (resizeObserver) resizeObserver.disconnect()
      if (anchored && anchored.parentNode)
        anchored.parentNode.removeChild(anchored)
    } catch {}
    if (inner && typeof inner.destroy === 'function') {
      try {
        inner.destroy()
      } catch {}
    }
  }

  return {
    ...inner,
    anchoredContainer: anchored,
    reposition,
    destroy,
  }
}

// Render the step-by-step view into a given UI created by createStepInstructionsUI
export function renderStepInstructions({
  model,
  flatIndex = 0,
  elements,
  options = {},
  lang = 'en',
  langDirection = 'LTR',
  phrases = {
    EE_UseKeysToStep: {
      en: ' ',
    },
    EE_UseKeysToStepWithVideo: {
      en: '',
    },
  },
}) {
  const {
    calibrateDistanceCheckBool = false,
    thresholdFraction = 0.6,
    resolveMediaUrl = url => url,
    useCurrentSectionOnly = true,
    showAllSteps = false,
    // How many *past* steps to keep visible when compacting.
    // If null/undefined, keep as many as fit (previous behavior).
    // New behavior: integer number of past steps Stepper *tries* to show.
    // Default 1, minimum 0. Can also be passed as options._stepperHistory.
    stepperHistory: stepperHistoryOption = 1,
    layout = 'twoColumn', // 'twoColumn' | 'leftOnly'
    // Show large "Instructions" heading above the stepper (for justCreditCard page)
    showLargeHeading = false,
    // Offset from the bottom of the screen (e.g., for progress bar)
    bottomOffset = 0,
  } = options

  const { leftText, rightText, mediaContainer } = elements

  const buildLineNode = (text, type, state = 'normal', indentLevel = 0) => {
    const div = document.createElement('div')
    div.style.whiteSpace = 'pre-wrap'
    div.style.wordBreak = 'break-word'
    div.style.overflowWrap = 'anywhere'

    // Sanitize text: remove any stray <img> and <video> HTML elements
    // that might cause duplicate media display
    const sanitizedText = text
      .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '')
      .replace(/<video[^>]*\/?>/gi, '')
      .replace(/<img[^>]*\/?>/gi, '')

    if (type === 'title') {
      div.style.marginTop = '0.75rem'
      div.style.fontWeight = '600'
      div.innerHTML = sanitizedText // Changed from textContent to support HTML from Markdown
    } else {
      div.style.marginTop = '0.25rem'
      // Preserve original text with its numbering/bullets instead of adding generic bullet
      div.innerHTML = sanitizedText // Changed from textContent to support HTML from Markdown
      if (indentLevel > 0) {
        div.style.paddingInlineStart = `${indentLevel * 1.25}em`
      }
    }
    if (state === 'past') {
      div.style.color = '#777'
    } else if (state === 'current') {
      div.style.color = '#000'
    }
    return div
  }

  // Fallback: raw text not supported here; consumer should pass a model
  if (!model) {
    leftText.textContent = ''
    if (rightText) rightText.textContent = ''
    mediaContainer.innerHTML = ''
    return
  }

  const { sections, flatSteps } = model

  // Sanitize current flat index
  const totalFlatSteps = flatSteps?.length || 0
  const safeFlatIndex =
    totalFlatSteps > 0
      ? Math.max(0, Math.min(flatIndex, totalFlatSteps - 1))
      : 0
  const { sectionIdx: curSectionIdx, stepIdx: curStepIdx } = flatSteps[
    safeFlatIndex
  ] || { sectionIdx: 0, stepIdx: 0 }

  // If Stepper is called with no text, don't display anything: no box, nothing.
  const hasAnyText =
    Array.isArray(sections) &&
    sections.some(
      sec =>
        Array.isArray(sec.steps) &&
        sec.steps.some(st => st.text && String(st.text).trim().length > 0),
    )

  const hasAnyVideo =
    Array.isArray(sections) &&
    sections.some(
      sec =>
        Array.isArray(sec.steps) &&
        sec.steps.some(st => st.mediaUrls && st.mediaUrls.length > 0),
    )

  if (!hasAnyText || totalFlatSteps === 0) {
    leftText.innerHTML = ''
    if (rightText) rightText.innerHTML = ''
    mediaContainer.innerHTML = ''
    leftText.style.display = 'none'
    return
  }

  // Ensure container is visible when we *do* have content
  leftText.style.display = ''

  // Resolve stepper history (integer, min 0). Allow options._stepperHistory alias.
  const rawHistory =
    (options && typeof options._stepperHistory !== 'undefined'
      ? options._stepperHistory
      : stepperHistoryOption) ?? 1
  let history = parseInt(rawHistory, 10)
  if (!Number.isFinite(history) || history < 0) history = 0

  // Determine allotted space for media only; let the stepper box size itself.
  // Subtract bottomOffset to avoid overlap with fixed elements like progress bar
  const availableHeight = window.innerHeight - bottomOffset
  const mediaAllottedPx =
    layout === 'leftOnly'
      ? Math.max(0, Math.floor(availableHeight * (1 - thresholdFraction)))
      : Math.floor(availableHeight * thresholdFraction)

  // Build Stepper box
  leftText.innerHTML = ''
  if (rightText) rightText.innerHTML = ''

  const stepperBox = document.createElement('div')
  stepperBox.style.position = 'relative'
  // Light background (more opaque for readability)
  stepperBox.style.backgroundColor = 'rgba(255, 255, 255, 0.7)'
  // Thin black outline
  stepperBox.style.border = '1px solid #000'
  stepperBox.style.borderRadius = '4px'
  stepperBox.style.padding = '0.75rem 2rem 0.75rem 0.75rem'
  stepperBox.style.display = 'inline-block'
  stepperBox.style.boxSizing = 'border-box'
  stepperBox.style.maxWidth = '100%'
  // Enable pointer events so stepper is interactive even when parent has pointer-events: none
  stepperBox.style.pointerEvents = 'auto'
  if (showAllSteps) {
    stepperBox.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'
  }

  const contentContainer = document.createElement('div')
  contentContainer.style.display = 'flex'
  contentContainer.style.flexDirection = 'column'
  // Constrain any inline images/videos that might be in step text
  contentContainer.style.overflow = 'hidden'

  stepperBox.appendChild(contentContainer)

  // Add CSS to constrain any inline images/videos in step text
  const inlineMediaStyle = document.createElement('style')
  inlineMediaStyle.textContent = `
    .step-instruction-text img, .step-instruction-text video {
      max-height: ${mediaAllottedPx}px;
      max-width: 100%;
      object-fit: contain;
    }
  `
  stepperBox.appendChild(inlineMediaStyle)
  contentContainer.classList.add('step-instruction-text')

  // Add large "Instructions" heading above the stepper (only for justCreditCard page)
  if (showLargeHeading) {
    const instructionsHeading = document.createElement('div')
    instructionsHeading.style.fontSize = '64px'
    instructionsHeading.style.fontWeight = 'bold'
    instructionsHeading.style.color = 'black'
    instructionsHeading.style.marginBottom = '0.5rem'
    instructionsHeading.style.textAlign =
      langDirection === 'RTL' ? 'right' : 'left'
    instructionsHeading.textContent =
      phrases.RC_Instructions?.[lang] || 'Instructions'
    leftText.appendChild(instructionsHeading)
  }

  // Add navigation hint on top of stepper box
  const navHintContainer = document.createElement('div')
  navHintContainer.style.marginBottom = '0.5rem'

  const navHint = document.createElement('div')
  navHint.style.color = 'black'
  navHint.style.backgroundColor = 'rgba(255, 255, 255, 0.35)'
  navHint.style.padding = '0.3rem'
  navHint.style.borderRadius = '4px'
  navHint.style.width = 'fit-content'
  navHint.style.fontSize = 'clamp(0.9em, 2vw, 1em)'
  navHint.style.fontStyle = 'italic'
  navHint.style.maxWidth = '100%'
  navHint.style.whiteSpace = 'normal'
  navHint.style.wordBreak = 'break-word'
  navHint.style.overflowWrap = 'anywhere'

  // Align based on language direction
  navHint.style.textAlign = langDirection === 'RTL' ? 'right' : 'left'

  navHint.textContent = hasAnyVideo
    ? phrases.EE_UseKeysToStepWithVideo?.[lang]
    : phrases.EE_UseKeysToStep?.[lang]

  if (showAllSteps) {
    navHint.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'
  }

  navHintContainer.appendChild(navHint)
  if (showAllSteps) {
    navHintContainer.style.display = 'none'
  }
  leftText.appendChild(navHintContainer)
  leftText.appendChild(stepperBox)

  // Decide which steps to show
  const totalSteps = totalFlatSteps
  const hasUnshownPast = showAllSteps ? false : safeFlatIndex > history
  const hasUnshownFuture = showAllSteps ? false : safeFlatIndex < totalSteps - 1

  const visibleStart = showAllSteps ? 0 : Math.max(0, safeFlatIndex - history)
  const visibleEnd = showAllSteps ? totalSteps - 1 : safeFlatIndex // inclusive

  // Helper to append a line into the Stepper content
  const appendLine = (text, state, level = 0) => {
    const node = buildLineNode(text, 'step', state, level || 0)
    contentContainer.appendChild(node)
  }

  // Past ellipsis (gray) if there are unshown past steps
  if (hasUnshownPast) {
    appendLine('…', 'past', 0)
  }

  // Track last rendered section to show section titles when transitioning
  let lastRenderedSectionIdx = -1

  // Visible past steps (gray) and current step (black)
  for (let idx = visibleStart; idx <= visibleEnd; idx++) {
    const entry = flatSteps[idx]
    if (!entry) continue
    const sec = sections[entry.sectionIdx]
    const step = sec && sec.steps ? sec.steps[entry.stepIdx] : null
    if (!step || !step.text) continue

    // Render section title when entering a new section (if title exists)
    if (entry.sectionIdx !== lastRenderedSectionIdx && sec.title) {
      const titleState = showAllSteps
        ? 'normal'
        : idx < safeFlatIndex
          ? 'past'
          : 'current'
      // Apply markdown formatting to the section title
      const formattedTitle = processInlineFormatting(sec.title)
      const titleNode = buildLineNode(formattedTitle, 'title', titleState, 0)
      contentContainer.appendChild(titleNode)
      lastRenderedSectionIdx = entry.sectionIdx
    }

    const isPast = idx < safeFlatIndex
    const level =
      typeof step.level === 'number'
        ? step.level
        : Math.max(0, (String(step.number || '').match(/\./g) || []).length)
    const state = showAllSteps
      ? 'normal'
      : isPast
        ? 'past'
        : idx === safeFlatIndex
          ? 'current'
          : 'future'
    appendLine(step.text, state, level)
  }

  // Future ellipsis (black) if there are unshown future steps
  if (hasUnshownFuture) {
    appendLine('…', 'current', 0)
  }

  // On-screen ▲ / ▼ controls in upper-right / lower-right.
  const arrowBaseStyle = el => {
    el.style.position = 'absolute'
    el.style.right = '0.5rem'
    el.style.fontSize = '1.1em'
    el.style.userSelect = 'none'
    // Enable pointer events so arrows are clickable even when parent has pointer-events: none
    el.style.pointerEvents = 'auto'
  }

  const arrowUp = document.createElement('div')
  arrowUp.textContent = '▲'
  arrowBaseStyle(arrowUp)
  arrowUp.style.top = '0.35rem'

  const arrowDown = document.createElement('div')
  arrowDown.textContent = '▼'
  arrowBaseStyle(arrowDown)
  arrowDown.style.bottom = '0.35rem'

  if (showAllSteps) {
    arrowUp.style.display = 'none'
    arrowDown.style.display = 'none'
  }

  const wireArrow = (el, handler) => {
    // Always enable arrows when handler is provided (even if only one step)
    const hasHandler = typeof handler === 'function'
    el.style.color = hasHandler ? '#000' : '#999'
    el.style.cursor = hasHandler ? 'pointer' : 'default'
    el.onclick = null
    if (hasHandler) {
      el.onclick = evt => {
        evt.preventDefault()
        evt.stopPropagation()
        handler()
      }
    }
  }

  // Use callbacks if provided so the caller can update flatIndex and re-render
  const onPrev =
    options && typeof options.onPrev === 'function' ? options.onPrev : null
  const onNext =
    options && typeof options.onNext === 'function' ? options.onNext : null

  wireArrow(arrowUp, onPrev)
  wireArrow(arrowDown, onNext)

  stepperBox.appendChild(arrowUp)
  stepperBox.appendChild(arrowDown)

  // Render media for current section
  mediaContainer.innerHTML = ''
  const mediaHeightPx = mediaAllottedPx
  mediaContainer.style.maxHeight = `${mediaHeightPx}px`
  mediaContainer.style.overflow = 'hidden'
  // Add margin-bottom to ensure media stays above fixed elements like progress bar
  if (bottomOffset > 0) {
    mediaContainer.style.marginBottom = `${bottomOffset}px`
  }
  // Prefer media linked to the current step; fallback to section-level media
  const currentStepObj = sections[curSectionIdx]?.steps?.[curStepIdx] || null
  const stepMediaUrls = (currentStepObj?.mediaUrls || []).filter(Boolean)
  const sectionMediaUrls = (sections[curSectionIdx]?.mediaUrls || []).filter(
    Boolean,
  )
  const mediaUrls = stepMediaUrls.length ? stepMediaUrls : sectionMediaUrls
  const chosen = mediaUrls.length ? mediaUrls[mediaUrls.length - 1] : null
  if (chosen) {
    const srcUrl = resolveMediaUrl(chosen)
    if (/\.mp4(\?|$)/i.test(chosen)) {
      const vid = document.createElement('video')
      vid.crossOrigin = 'anonymous'
      vid.src = srcUrl
      vid.muted = true
      vid.autoplay = true
      vid.loop = false
      vid.playsInline = true
      vid.controls = false
      vid.style.width = '100%'
      vid.style.maxHeight = `${mediaHeightPx}px` // Use maxHeight so video only takes space it needs
      vid.style.height = 'auto'
      vid.style.objectFit = 'contain'
      mediaContainer.appendChild(vid)
    } else {
      const img = document.createElement('img')
      img.crossOrigin = 'anonymous'
      img.src = srcUrl
      img.alt = ''
      img.style.width = '100%'
      img.style.maxHeight = `${mediaHeightPx}px` // Use maxHeight so image only takes space it needs
      img.style.height = 'auto'
      img.style.objectFit = 'contain'
      mediaContainer.appendChild(img)
    }
  }
}
