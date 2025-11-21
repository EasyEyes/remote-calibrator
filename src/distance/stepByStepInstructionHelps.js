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
  } = options

  const wrapper = document.createElement('div')
  wrapper.style.display = layout === 'twoColumn' ? 'flex' : 'block'
  if (layout === 'twoColumn') wrapper.style.flexDirection = 'row'
  wrapper.style.width = '100%'
  wrapper.style.maxWidth = '100%'
  parent.appendChild(wrapper)

  const leftColumn = document.createElement('div')
  leftColumn.style.width = leftWidth
  leftColumn.style.maxWidth = leftWidth
  leftColumn.style.paddingInlineStart = leftPaddingStart
  leftColumn.style.paddingInlineEnd = leftPaddingEnd
  leftColumn.style.textAlign = 'start'
  leftColumn.style.fontSize = fontSize
  leftColumn.style.lineHeight = lineHeight
  const leftText = document.createElement('div')
  leftText.style.whiteSpace = 'pre-line'
  leftText.style.wordBreak = 'break-word'
  leftText.style.overflowWrap = 'anywhere'
  leftColumn.appendChild(leftText)
  wrapper.appendChild(leftColumn)

  let rightColumn = null
  let rightText = null
  const mediaContainer = document.createElement('div')
  mediaContainer.style.marginTop = '1rem'
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
    rightText = document.createElement('div')
    rightText.style.whiteSpace = 'pre-line'
    rightText.style.wordBreak = 'break-word'
    rightText.style.overflowWrap = 'anywhere'
    rightColumn.appendChild(rightText)
    wrapper.appendChild(rightColumn)
    rightColumn.appendChild(mediaContainer)
  } else {
    // leftOnly layout: media goes under the left text inside left column
    leftColumn.style.display = 'flex'
    leftColumn.style.flexDirection = 'column'
    leftText.style.flex = '0 0 auto'
    leftColumn.appendChild(mediaContainer)
  }

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
    },
  }
}

// Render the step-by-step view into a given UI created by createStepInstructionsUI
export function renderStepInstructions({
  model,
  flatIndex = 0,
  elements,
  options = {},
  lang = 'en',
  phrases = {
    EE_UseKeysToStep: {
      en: 'Press the ▼ key to step to the next instruction. Press ▲ to go back one step.',
    },
  },
}) {
  const {
    calibrateTrackDistanceCheckBool = false,
    thresholdFraction = 0.6,
    resolveMediaUrl = url => url,
    useCurrentSectionOnly = true,
    // How many *past* steps to keep visible when compacting.
    // If null/undefined, keep as many as fit (previous behavior).
    // New behavior: integer number of past steps Stepper *tries* to show.
    // Default 1, minimum 0. Can also be passed as options._stepperHistory.
    stepperHistory: stepperHistoryOption = 1,
    layout = 'twoColumn', // 'twoColumn' | 'leftOnly'
  } = options

  const { leftText, rightText, mediaContainer } = elements

  const buildLineNode = (text, type, state = 'normal', indentLevel = 0) => {
    const div = document.createElement('div')
    div.style.whiteSpace = 'pre-wrap'
    div.style.wordBreak = 'break-word'
    div.style.overflowWrap = 'anywhere'
    if (type === 'title') {
      div.style.marginTop = '0.75rem'
      div.style.fontWeight = '600'
      div.textContent = text
    } else {
      div.style.marginTop = '0.25rem'
      // Preserve original text with its numbering/bullets instead of adding generic bullet
      div.textContent = text
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
  const mediaAllottedPx =
    layout === 'leftOnly'
      ? Math.max(0, Math.floor(window.innerHeight * (1 - thresholdFraction)))
      : Math.floor(window.innerHeight * thresholdFraction)

  // Build Stepper box
  leftText.innerHTML = ''
  if (rightText) rightText.innerHTML = ''

  const stepperBox = document.createElement('div')
  stepperBox.style.position = 'relative'
  // Very faint light blue background
  stepperBox.style.backgroundColor = 'rgba(173, 216, 230, 0.25)'
  // Thin black outline
  stepperBox.style.border = '1px solid #000'
  stepperBox.style.borderRadius = '4px'
  stepperBox.style.padding = '0.75rem 2rem 0.75rem 0.75rem'
  stepperBox.style.display = 'inline-block'
  stepperBox.style.boxSizing = 'border-box'
  stepperBox.style.maxWidth = '100%'

  const contentContainer = document.createElement('div')
  contentContainer.style.display = 'flex'
  contentContainer.style.flexDirection = 'column'

  stepperBox.appendChild(contentContainer)
  leftText.appendChild(stepperBox)

  // Decide which steps to show
  const totalSteps = totalFlatSteps
  const hasUnshownPast = safeFlatIndex > history
  const hasUnshownFuture = safeFlatIndex < totalSteps - 1

  const visibleStart = Math.max(0, safeFlatIndex - history)
  const visibleEnd = safeFlatIndex // inclusive

  // Helper to append a line into the Stepper content
  const appendLine = (text, state, level = 0) => {
    const node = buildLineNode(text, 'step', state, level || 0)
    contentContainer.appendChild(node)
  }

  // Past ellipsis (gray) if there are unshown past steps
  if (hasUnshownPast) {
    appendLine('…', 'past', 0)
  }

  // Visible past steps (gray) and current step (black)
  for (let idx = visibleStart; idx <= visibleEnd; idx++) {
    const entry = flatSteps[idx]
    if (!entry) continue
    const sec = sections[entry.sectionIdx]
    const step = sec && sec.steps ? sec.steps[entry.stepIdx] : null
    if (!step || !step.text) continue

    const isPast = idx < safeFlatIndex
    const level =
      typeof step.level === 'number'
        ? step.level
        : Math.max(0, (String(step.number || '').match(/\./g) || []).length)
    appendLine(step.text, isPast ? 'past' : 'current', level)
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
  }

  const arrowUp = document.createElement('div')
  arrowUp.textContent = '▲'
  arrowBaseStyle(arrowUp)
  arrowUp.style.top = '0.35rem'

  const arrowDown = document.createElement('div')
  arrowDown.textContent = '▼'
  arrowBaseStyle(arrowDown)
  arrowDown.style.bottom = '0.35rem'

  const wireArrow = (el, enabled, handler) => {
    el.style.color = enabled ? '#000' : '#999'
    el.style.cursor =
      enabled && typeof handler === 'function' ? 'pointer' : 'default'
    el.onclick = null
    if (enabled && typeof handler === 'function') {
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

  wireArrow(arrowUp, hasUnshownPast, onPrev)
  wireArrow(arrowDown, hasUnshownFuture, onNext)

  stepperBox.appendChild(arrowUp)
  stepperBox.appendChild(arrowDown)

  // Helper to build nav hint node; used for both measurement and final render
  const buildNavHintNode = () => {
    const navHint = document.createElement('div')
    navHint.style.marginTop = '0.5rem'
    navHint.style.color = '#555'
    // Decreased font size by ~30% from previous values
    navHint.style.fontSize = 'clamp(0.9em, 2vw, 1em)'
    navHint.style.fontStyle = 'italic'
    // Restrict width to ~1/3 of the viewport and allow wrapping
    navHint.style.maxWidth = '33vw'
    navHint.style.whiteSpace = 'normal'
    navHint.style.wordBreak = 'break-word'
    navHint.style.overflowWrap = 'anywhere'
    navHint.textContent =
      phrases.EE_UseKeysToStep?.[lang] ||
      'Use ▼ to advance through the instructions. Use ▲ to go back to the previous instruction.'
    return navHint
  }
  // (Compaction-by-height removed; Stepper box now sizes itself based on
  // the current step and the configured history.)

  // Render navigation hint as its own row directly below the title row (not in the flex row)
  const titleEl =
    document.getElementById('distance-tracking-title') ||
    document.getElementById('check-distance-instruction-title')
  if (titleEl && titleEl.id === 'distance-tracking-title') {
    try {
      if (titleEl.parentNode && titleEl.parentNode.parentNode) {
        const titleRow = titleEl.parentNode
        const container = titleRow.parentNode
        // Remove any existing nav hint to avoid duplicates across re-renders
        const existing = document.getElementById('distance-tracking-nav-hint')
        if (existing && existing.parentNode) {
          existing.parentNode.removeChild(existing)
        }
        const navHint = buildNavHintNode()
        navHint.id = 'distance-tracking-nav-hint'
        // Align with title's left padding (matches titleRow's paddingInlineStart)
        navHint.style.paddingInlineStart = '3rem'
        container.insertBefore(navHint, titleRow.nextSibling)
      }
    } catch (error) {
      console.warn(
        'Error adding navigation hint to distance tracking title:',
        error,
      )
    }
  } else if (titleEl && titleEl.id === 'check-distance-instruction-title') {
    try {
      // Remove any existing nav hint to avoid duplicates across re-renders
      const existing = document.getElementById('distance-tracking-nav-hint')
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing)
      }
      const parent = titleEl.parentNode
      titleEl.style.margin = 0
      const thirdElement = parent.children[1]
      const navHint = buildNavHintNode()
      navHint.id = 'distance-tracking-nav-hint'
      parent.insertBefore(navHint, thirdElement)
    } catch (e) {
      console.error('Error rendering navigation hint:', e)
    }
  }

  // Render media for current section
  mediaContainer.innerHTML = ''
  const mediaHeightPx = mediaAllottedPx
  mediaContainer.style.maxHeight = `${mediaHeightPx}px`
  mediaContainer.style.overflow = 'hidden'
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
      vid.style.height = `${mediaHeightPx}px`
      vid.style.objectFit = 'contain'
      mediaContainer.appendChild(vid)
    } else {
      const img = document.createElement('img')
      img.crossOrigin = 'anonymous'
      img.src = srcUrl
      img.alt = ''
      img.style.width = '100%'
      img.style.height = `${mediaHeightPx}px`
      img.style.objectFit = 'contain'
      mediaContainer.appendChild(img)
    }
  }
}
