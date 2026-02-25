import { processInlineFormatting } from '../distance/markdownInstructionParser'

/**
 * Creates a hand-preference selector (radio group).
 *
 * @param {object} opts
 * @param {object}  opts.phrases       - The full phrases dictionary
 * @param {string}  opts.lang          - Current language key
 * @param {boolean} opts.preferRight   - Current hand preference (true = right)
 * @param {function} opts.onChange      - Called with (isRight: boolean) on change
 * @param {string}  opts.objectPhraseKey - Phrase key replacing [[OOO]]
 * @param {string}  [opts.marginStart='0'] - CSS padding-inline-start
 * @param {boolean} [opts.compact=false]   - When true, all font sizes reduced by 30%
 * @returns {HTMLElement}
 */
export function createHandPreferenceSelector({
  phrases,
  lang,
  preferRight,
  onChange,
  objectPhraseKey,
  marginStart = '0',
  compact = false,
}) {
  const objectName = phrases[objectPhraseKey]?.[lang] || ''

  const titleFontSize = 'clamp(1rem, 3vmin, 1.4rem)'
  const optionFontSize = 'clamp(1rem, 2.5vmin, 1.3rem)'
  const radioSize = 'clamp(14px, 3vmin, 16px)'

  const container = document.createElement('div')
  container.className = 'rc-hand-preference-selector'
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.gap = compact ? '0.1rem' : 'clamp(0.3rem, 1.5vmin, 0.7rem)'
  container.style.alignItems = 'flex-start'
  container.style.padding = compact
    ? '0.2rem 0'
    : 'clamp(0.75rem, 3vmin, 1.5rem) 0 0.3rem 0'
  container.style.paddingInlineStart = marginStart
  container.style.pointerEvents = 'auto'
  container.style.maxWidth = '50vw'

  const titleDiv = document.createElement('div')
  const titleRaw =
    phrases.RC_WhichDoYouPrefer?.[lang] || '**Which do you prefer?**'
  titleDiv.innerHTML = processInlineFormatting(titleRaw)
  titleDiv.style.fontSize = titleFontSize
  titleDiv.style.fontWeight = '600'
  titleDiv.style.color = '#111'
  titleDiv.style.lineHeight = '1.15'
  titleDiv.style.marginBottom = compact
    ? '0.05rem'
    : 'clamp(0.2rem, 1vmin, 0.4rem)'
  // Force all children to inherit font-size (overrides .calibration-instruction * CSS)
  titleDiv.querySelectorAll('*').forEach(el => {
    el.style.fontSize = 'inherit'
    el.style.lineHeight = 'inherit'
  })
  container.appendChild(titleDiv)

  const uid = `hand-pref-${Date.now()}`

  const makeRow = (phraseKey, fallback, isRight) => {
    const label = document.createElement('label')
    label.style.display = 'flex'
    label.style.alignItems = 'center'
    label.style.gap = '1px'
    label.style.cursor = 'pointer'
    label.style.fontSize = optionFontSize
    label.style.lineHeight = compact ? '1.05' : '1.2'
    label.style.color = '#111'
    label.style.padding = '0'

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = uid
    radio.value = isRight ? 'right' : 'left'
    radio.checked = isRight ? preferRight : !preferRight
    radio.style.cursor = 'pointer'
    radio.style.marginRight = compact ? '0.2rem' : '0.5rem'
    radio.style.width = radioSize
    radio.style.height = radioSize
    radio.style.flexShrink = '0'
    radio.onchange = () => onChange(isRight)

    const span = document.createElement('span')
    span.style.fontSize = 'inherit'
    span.style.lineHeight = 'inherit'
    let rawText = phrases[phraseKey]?.[lang] || fallback
    rawText = rawText.replace('[[OOO]]', objectName)
    span.innerHTML = processInlineFormatting(rawText)
    // Force children to inherit font-size unless they already carry an explicit inline size
    span.querySelectorAll('*').forEach(el => {
      if (!el.style.fontSize) el.style.fontSize = 'inherit'
      if (!el.style.lineHeight) el.style.lineHeight = 'inherit'
    })

    label.appendChild(radio)
    label.appendChild(span)
    return label
  }

  container.appendChild(
    makeRow(
      'RC_UseMyRightHandToHoldOOO',
      '🤏 Use my right hand to hold [[OOO]]',
      true,
    ),
  )
  container.appendChild(
    makeRow(
      'RC_UseMyLeftHandToHoldOOO',
      '🤏 Use my left hand to hold [[OOO]]',
      false,
    ),
  )

  return container
}

/**
 * Proportionally scale a container (CSS transform) so its bottom edge stays
 * above the status/progress bar. Both stepper and hand selector shrink together.
 *
 * @param {HTMLElement} container - The wrapper div to scale
 * @param {number}     barHeight - Height in px of the progress bar at screen bottom
 * @param {number}     [minScale=0.35]
 */
export function scaleToFitAboveBar(container, barHeight = 44, minScale = 0.35) {
  if (!container) return

  const apply = () => {
    // 1. Reset previous scaling so we measure natural size
    container.style.transform = 'none'
    container.style.height = 'auto'
    container.style.width = '100%'
    container.style.transformOrigin = 'top left'

    // Force reflow so measurements reflect natural size
    // eslint-disable-next-line no-unused-expressions
    container.offsetHeight

    const rect = container.getBoundingClientRect()
    const maxBottom = window.innerHeight - barHeight
    if (rect.height === 0) return

    const availableH = maxBottom - rect.top
    if (availableH <= 0 || availableH >= rect.height) {
      // Fits already — clear the transform
      container.style.transform = ''
      return
    }

    const scale = Math.max(availableH / rect.height, minScale)

    container.style.transform = `scale(${scale})`
    // Tell the parent how tall the scaled content actually is
    container.style.height = `${Math.ceil(rect.height * scale)}px`
    // Counter the horizontal squeeze from scale()
    container.style.width = `${Math.ceil(100 / scale)}%`
  }

  // Run immediately (synchronous) then re-check after layout settles
  apply()
  requestAnimationFrame(() => setTimeout(apply, 60))
}
