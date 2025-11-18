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
    stepperHistory = null,
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
  const { sectionIdx: curSectionIdx, stepIdx: curStepIdx } = flatSteps[
    flatIndex
  ] || { sectionIdx: 0, stepIdx: 0 }

  // Build items up to current
  const items = []
  let orderIdx = 0
  for (let s = 0; s <= curSectionIdx; s++) {
    const section = sections[s]
    const limit = s < curSectionIdx ? section.steps.length - 1 : curStepIdx
    const titleText = (section?.title || '').trim()
    if (titleText.length) {
      items.push({
        type: 'title',
        text: titleText,
        sectionIdx: s,
        orderIdx: orderIdx++,
        uid: `title|${s}|${titleText}`,
      })
    }
    for (let i = 0; i <= limit; i++) {
      const step = section.steps[i]
      const state = s < curSectionIdx || i < curStepIdx ? 'past' : 'current'
      const number = step.number
      const level =
        typeof step.level === 'number'
          ? step.level
          : Math.max(0, (String(number).match(/\./g) || []).length)
      items.push({
        type: 'step',
        text: step.text,
        state,
        number,
        level,
        sectionIdx: s,
        orderIdx: orderIdx++,
        uid: `step|${s}|${number}|${step.text}`,
      })
    }
  }

  // Render and compact if needed
  leftText.innerHTML = ''
  if (rightText) rightText.innerHTML = ''
  // Determine allotted space for text and media
  const textAllottedPx = Math.floor(window.innerHeight * thresholdFraction)
  const mediaAllottedPx =
    layout === 'leftOnly'
      ? Math.max(0, Math.floor(window.innerHeight * (1 - thresholdFraction)))
      : Math.floor(window.innerHeight * thresholdFraction)
  // Apply fixed sizes in leftOnly to prevent media from moving
  if (layout === 'leftOnly') {
    leftText.style.maxHeight = `${textAllottedPx}px`
    leftText.style.minHeight = `${textAllottedPx}px`
    leftText.style.overflow = 'hidden'
    mediaContainer.style.height = `${mediaAllottedPx}px`
  }
  const threshold = textAllottedPx
  const renderItems = list => {
    leftText.innerHTML = ''
    list.forEach(item => {
      if (item.type === 'title') {
        leftText.appendChild(buildLineNode(item.text, 'title', 'normal', 0))
      } else {
        leftText.appendChild(
          buildLineNode(item.text, 'step', item.state, item.level || 0),
        )
      }
    })
  }
  renderItems(items)
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
  // Decide on compaction based on instruction text only (nav hint is rendered separately)
  let needsCompact =
    leftText.scrollHeight > threshold ||
    stepperHistory !== null ||
    stepperHistory !== undefined
  if (needsCompact) {
    const stepsAll = items.filter(i => i.type === 'step')
    const stepsSeq = useCurrentSectionOnly
      ? stepsAll.filter(it => it.sectionIdx === curSectionIdx)
      : stepsAll
    const titleItem = items.find(
      it => it.type === 'title' && it.sectionIdx === curSectionIdx,
    )
    const originalOrder = (a, b) => a.orderIdx - b.orderIdx
    const buildWithParents = steps => {
      const result = []
      const byUid = new Set()
      const ensurePush = it => {
        if (!byUid.has(it.uid)) {
          result.push(it)
          byUid.add(it.uid)
        }
      }
      const findNearestParentInSet = step => {
        if (!step.number) return null
        const parts = String(step.number).split('.')
        while (parts.length > 1) {
          parts.pop()
          const parentNum = parts.join('.')
          const found = steps
            .slice()
            .reverse()
            .find(
              cand =>
                String(cand.number) === parentNum &&
                cand.sectionIdx === step.sectionIdx,
            )
          if (found) return found
        }
        return null
      }
      steps.forEach(st => {
        if (st.sectionIdx === curSectionIdx && st.level > 0) {
          const parent = findNearestParentInSet(st)
          if (parent) ensurePush(parent)
        }
        ensurePush(st)
      })
      result.sort(originalOrder)
      return result
    }
    const totalSteps = stepsSeq.length
    let bestStart = totalSteps > 0 ? totalSteps - 1 : 0
    const measureFits = startIdx => {
      const slice = stepsSeq.slice(startIdx)
      const withParents = buildWithParents(slice)
      const nodes = []
      if (titleItem) nodes.push(buildLineNode(titleItem.text, 'title'))
      withParents.forEach(it => {
        nodes.push(buildLineNode(it.text, 'step', it.state, it.level || 0))
      })
      leftText.innerHTML = ''
      nodes.forEach(n => leftText.appendChild(n))
      // Measure only the instruction text; nav hint is positioned outside this container
      const fits = leftText.scrollHeight <= threshold
      return { fits, nodes }
    }
    if (totalSteps > 0) {
      const hasHistoryLimit =
        typeof stepperHistory === 'number' && stepperHistory >= 0
      console.log('hasHistoryLimit..', hasHistoryLimit, stepperHistory)
      if (!hasHistoryLimit) {
        // Previous behavior: try to show as many steps as possible while fitting.
        let low = 0
        let high = totalSteps - 1
        // Initial probe to short-circuit if everything fits
        {
          const test = measureFits(0)
          if (test.fits) {
            leftText.innerHTML = ''
            test.nodes.forEach(n => leftText.appendChild(n))
          }
        }
        while (low <= high) {
          const mid = Math.floor((low + high) / 2)
          const { fits } = measureFits(mid)
          if (fits) {
            bestStart = mid
            high = mid - 1
          } else {
            low = mid + 1
          }
        }
      } else {
        // New behavior with stepperHistory:
        // limit how many *past* steps can be shown, but still respect the height.
        const maxPast = Math.floor(stepperHistory)
        const minStart = Math.max(0, totalSteps - 1 - maxPast)
        let low = minStart
        let high = totalSteps - 1
        console.log('maxPast..', maxPast)
        console.log('minStart..', minStart)
        console.log('low..', low)
        console.log('high..', high)
        while (low <= high) {
          const mid = Math.floor((low + high) / 2)
          const { fits } = measureFits(mid)
          if (fits) {
            bestStart = mid
            high = mid - 1
          } else {
            low = mid + 1
          }
        }
        console.log('bestStart..', bestStart)
      }
      // Always render the best-fitting slice after search to avoid leaving a temp state
      {
        const { nodes } = measureFits(bestStart)
        leftText.innerHTML = ''
        nodes.forEach(n => leftText.appendChild(n))
      }
    }
  }

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
      console.warn('Error adding navigation hint to distance tracking title:', error)
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
