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
      currentSection.mediaKeys.push(key)
      const url = getLinkUrl(key)
      if (url) currentSection.mediaUrls.push(url)
      continue
    }

    // Step marker: [[SSn]] text...
    const ss = line.match(/^\[\[SS(\d+(?:\.\d+)*)\]\]\s*(.*)$/i)
    if (ss) {
      const number = ss[1]
      const text = ss[2] || ''
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
      currentSection.steps.push({ number, text, level })
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
}) {
  const {
    calibrateTrackDistanceCheckBool = false,
    thresholdFraction = 0.6,
    resolveMediaUrl = url => url,
    useCurrentSectionOnly = true,
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
      div.textContent = `• ${text}`
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
      : calibrateTrackDistanceCheckBool
        ? Math.floor(window.innerHeight * thresholdFraction * 0.7)
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
    navHint.style.fontSize = 'clamp(0.9em, 2vw, 1em)'
    navHint.style.fontStyle = 'italic'
    navHint.textContent =
      'Use ▼ to advance through the instructions. Use ▲ to go back to the previous instruction.'
    return navHint
  }
  // Include nav hint in overflow decision for compaction
  let needsCompact = false
  {
    const tmp = buildNavHintNode()
    leftText.appendChild(tmp)
    needsCompact = leftText.scrollHeight > threshold
    leftText.removeChild(tmp)
  }
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
    let low = 0
    let high = stepsSeq.length - 1
    let bestStart = stepsSeq.length - 1
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
      // Include nav hint in measurement to ensure final render fits
      const tmp = buildNavHintNode()
      leftText.appendChild(tmp)
      const fits = leftText.scrollHeight <= threshold
      // Remove temporary hint before returning so callers don't see duplicates
      if (tmp.parentNode === leftText) leftText.removeChild(tmp)
      return { fits, nodes }
    }
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
    // Always render the best-fitting slice after search to avoid leaving a temp state
    {
      const { nodes } = measureFits(bestStart)
      leftText.innerHTML = ''
      nodes.forEach(n => leftText.appendChild(n))
    }
  }

  // Append navigation hint below the current step
  leftText.appendChild(buildNavHintNode())

  // Render media for current section
  mediaContainer.innerHTML = ''
  const mediaHeightPx = mediaAllottedPx
  mediaContainer.style.maxHeight = `${mediaHeightPx}px`
  mediaContainer.style.overflow = 'hidden'
  const mediaUrls = (sections[curSectionIdx]?.mediaUrls || []).filter(Boolean)
  const chosen = mediaUrls.length ? mediaUrls[mediaUrls.length - 1] : null
  if (chosen) {
    const srcUrl = resolveMediaUrl(chosen)
    if (/\.mp4(\?|$)/i.test(chosen)) {
      const vid = document.createElement('video')
      vid.crossOrigin = 'anonymous'
      vid.src = srcUrl
      vid.muted = true
      vid.autoplay = true
      vid.loop = true
      vid.playsInline = true
      vid.controls = false
      vid.style.width = '100%'
      vid.style.height = `${mediaHeightPx}px`
      vid.style.objectFit = 'contain'
      vid.style.marginTop = '0.75rem'
      mediaContainer.appendChild(vid)
    } else {
      const img = document.createElement('img')
      img.crossOrigin = 'anonymous'
      img.src = srcUrl
      img.alt = ''
      img.style.width = '100%'
      img.style.height = `${mediaHeightPx}px`
      img.style.objectFit = 'contain'
      img.style.marginTop = '0.75rem'
      mediaContainer.appendChild(img)
    }
  }
}
