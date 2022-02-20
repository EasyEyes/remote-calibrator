import isEqual from 'react-fast-compare'

import RemoteCalibrator from './core'
import {
  toFixedNumber,
  blurAll,
  remap,
  safeExecuteFunc,
} from './components/utils'

import Card from './media/card.svg'
import Arrow from './media/arrow.svg'
import USBA from './media/usba.svg'
import USBC from './media/usbc.svg'

import {
  createSlider,
  setSliderPosition,
  setSliderStyle,
} from './components/slider'
import { bindKeys, unbindKeys } from './components/keyBinder'
import { addButtons } from './components/buttons'
import { phrases } from './i18n'

RemoteCalibrator.prototype._displaySize = function () {
  ////
  if (!this.checkInitialized()) return
  ////

  const thisData = {
    value: {
      displayWidthPx: screen.width,
      displayHeightPx: screen.height,
      windowWidthPx: window.innerWidth,
      windowHeightPx: window.innerHeight,
    },
    timestamp: new Date(),
  }

  if (
    !this.displayData.length ||
    !isEqual(
      thisData.value,
      this.displayData[this.displayData.length - 1].value
    )
  )
    this.newDisplayData = thisData
}

const resources = {
  card: Card,
  arrow: Arrow,
  usba: USBA,
  usbc: USBC,
}

const widthDataIn = {
  card: 3.375, // 85.6mm
  usba: 0.787402, // 20mm (12mm head)
  usbc: 0.787402, // 20mm (8.25mm head)
}

RemoteCalibrator.prototype.screenSize = function (options = {}, callback) {
  /**
   *
   * options -
   *
   * fullscreen: [Boolean]
   * repeatTesting: 1 // TODO
   * decimalPlace: [Number] Default 1
   * headline: [String]
   * description: [String]
   *
   */
  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 1,
      decimalPlace: 1,
      defaultObject: 'card', // Can be card, usba, usbc
      headline: '🖥️ ' + phrases.RC_screenSizeTitle[this.L],
      description: phrases.RC_screenSizeIntro[this.L],
      check: false,
      checkCallback: null,
    },
    options
  )

  this.getFullscreen(options.fullscreen)

  if (!['usba', 'usbc', 'card'].includes(options.defaultObject))
    options.defaultObject = 'card'

  options.description += `<br /><br /><b class="rc-size-obj-selection">${phrases.RC_screenSizeHave[
    this.L
  ].replace(
    'xxx',
    `<select id="matching-obj"><option value="usba"${
      options.defaultObject === 'usba' ? ' selected' : ''
    }>${phrases.RC_screenSizeUSBA[this.L]}</option><option value="usbc"${
      options.defaultObject === 'usbc' ? ' selected' : ''
    }>${phrases.RC_screenSizeUSBC[this.L]}</option><option value="card"${
      options.defaultObject === 'card' ? ' selected' : ''
    }>${phrases.RC_screenSizeCreditCard[this.L]}</option></select>`
  )}</b>`

  this._addBackground()
  this._addBackgroundText(options.headline, options.description)
  this._addCreditOnBackground(phrases.RC_screenSizeCredit[this.L])

  getSize(this, this.background, options, callback)

  return
}

function getSize(RC, parent, options, callback) {
  // Slider
  const sliderElement = createSlider(parent, 0, 100)

  const _onDown = (e, type) => {
    if (
      e.target.className === 'rc-slider' &&
      e.target.id === 'rc-size-slider' &&
      ((type === RC._CONST.S.CLICK_TYPE.MOUSE && e.which === 1) ||
        type === RC._CONST.S.CLICK_TYPE.TOUCH)
    ) {
      e.target.style.cursor = 'grabbing'
      arrowFillElement.setAttribute('fill', RC._CONST.COLOR.ORANGE)
      const _onEnd = () => {
        sliderElement.style.cursor = 'grab'
        arrowFillElement.setAttribute('fill', RC._CONST.COLOR.LIGHT_GREY)
        document.removeEventListener('mouseup', _onEnd, false)
      }
      if (type === RC._CONST.S.CLICK_TYPE.MOUSE)
        document.addEventListener('mouseup', _onEnd, false)
      else if (type === RC._CONST.S.CLICK_TYPE.TOUCH)
        document.addEventListener('touchend', _onEnd, false)
    }
  }

  const onMouseDown = e => {
    _onDown(e, 'mouse')
  }
  const onTouchStart = e => {
    _onDown(e, 'touch')
  }
  document.addEventListener('mousedown', onMouseDown, false)
  document.addEventListener('touchstart', onTouchStart, false)

  // Add all objects
  const elements = addMatchingObj(['card', 'arrow', 'usba', 'usbc'], parent)

  // Switch OBJ
  let currentMatchingObj = options.defaultObject // DEFAULT
  document.getElementById('matching-obj').addEventListener('change', e => {
    switchMatchingObj(e.target.value, elements, setSizes)
    currentMatchingObj = e.target.value
  })

  switchMatchingObj('card', elements)
  // Card & Arrow
  let arrowFillElement = document.getElementById('size-arrow-fill')
  arrowFillElement.setAttribute('fill', RC._CONST.COLOR.LIGHT_GREY)
  let arrowSizes = {
    width: elements.arrow.getBoundingClientRect().width,
    height: elements.arrow.getBoundingClientRect().height,
  }

  const setSizes = () => {
    setCardSizes(RC, sliderElement, elements.card, elements.arrow, arrowSizes)
    setConnectorSizes(sliderElement, elements.usba)
    setConnectorSizes(sliderElement, elements.usbc)
  }

  setSizes()
  const onSliderInput = () => {
    setSliderStyle(sliderElement)
    setSizes()
  }
  const resizeObserver = new ResizeObserver(() => {
    setSizes()
    setSliderPosition(sliderElement, parent)
    setObjectsPosition(elements, sliderElement)
  })
  resizeObserver.observe(parent)

  // Call when ESC pressed
  const breakFunction = () => {
    document.removeEventListener('mousedown', onMouseDown, false)
    document.removeEventListener('touchstart', onTouchStart, false)
    document.removeEventListener('input', onSliderInput, false)
    resizeObserver.unobserve(parent)
    RC._removeBackground()

    // Unbind keys
    unbindKeys(bindKeysFunction)
  }

  // Call when SPACE pressed
  // ! RETURN & BREAK
  const finishFunction = () => {
    let eleWidth =
      elements[currentMatchingObj].getBoundingClientRect().width ||
      parseInt(elements[currentMatchingObj].style.width) // Pixel

    let ppi = eleWidth / widthDataIn[currentMatchingObj]

    const toFixedN = options.decimalPlace

    // ! Get screen data
    const screenData = _getScreenData(ppi, toFixedN)
    // ! Record data
    RC.newScreenData = screenData

    // Remove listeners and DOM
    breakFunction()

    // ! Call the callback function
    if (options.check)
      RC._checkScreenSize(callback, screenData, options.checkCallback)
    else safeExecuteFunc(callback, screenData)

    return
  }

  sliderElement.addEventListener('input', onSliderInput, false)
  const bindKeysFunction = bindKeys({
    Escape: breakFunction,
    Enter: finishFunction,
    ' ': finishFunction,
  })

  addButtons(
    RC.L,
    RC.background,
    {
      go: finishFunction,
      cancel: breakFunction,
    },
    RC.params.showCancelButton
  )

  // Set to actual default object
  switchMatchingObj(currentMatchingObj, elements, setSizes)
}

const setCardSizes = (RC, slider, card, arrow, aS) => {
  // Card
  const targetWidth =
    (slider.offsetWidth - 30) *
      (slider.value / 100) *
      (window.innerWidth < 480 ? 2 : 1) +
    15
  card.style.width = targetWidth + 'px'
  // Arrow
  let cardSizes = card.getBoundingClientRect()
  if (cardSizes.width !== 0) {
    arrow.style.left = cardSizes.left + targetWidth + 'px'
    arrow.style.top =
      cardSizes.top +
      RC.background.scrollTop +
      (targetWidth * 0.63 - aS.height) / 2 +
      'px'
  }
}

const setConnectorSizes = (slider, connector) => {
  connector.style.width =
    remap(Math.pow(slider.value, 1.5), 0, 1000, 50, 400) + 'px'
}

const addMatchingObj = (names, parent) => {
  // Remove all elements from the page first
  let oldElements = document.getElementsByClassName('size-obj')
  while (oldElements.length) {
    oldElements[0].parentNode.removeChild(oldElements[0])
  }

  const elements = {}

  for (let name of names) {
    let element = document.createElement('div')
    parent.appendChild(element)
    element.outerHTML = resources[name]
    element = document.getElementById('size-' + name)
    element.setAttribute('preserveAspectRatio', 'none')
    element.style.visibility = 'hidden'
    elements[name] = element
  }

  setObjectsPosition(elements, document.querySelector('#rc-size-slider'))

  return elements
}

const switchMatchingObj = (name, elements, setSizes) => {
  for (let obj in elements) {
    if (obj === name) elements[obj].style.visibility = 'visible'
    else elements[obj].style.visibility = 'hidden'
  }
  // if (name === 'card') elements.arrow.style.visibility = 'visible'
  // else elements.arrow.style.visibility = 'hidden'
  elements.arrow.style.visibility = 'hidden'
  safeExecuteFunc(setSizes)
}

/**
 *
 * Get all screen data from known ppi
 *
 */
const _getScreenData = (ppi, toFixedN) => {
  const screenData = {
    value: {
      screenWidthCm: toFixedNumber(
        (2.54 * window.screen.width) / ppi,
        toFixedN
      ),
      screenHeightCm: toFixedNumber(
        (2.54 * window.screen.height) / ppi,
        toFixedN
      ),
      screenPhysicalPpi: toFixedNumber(ppi * window.devicePixelRatio, toFixedN),
      screenPpi: toFixedNumber(ppi, toFixedN),
    },
    timestamp: new Date(),
  }
  screenData.value.screenDiagonalCm = toFixedNumber(
    Math.hypot(screenData.value.screenWidthCm, screenData.value.screenHeightCm),
    toFixedN
  )
  screenData.value.screenDiagonalIn = toFixedNumber(
    screenData.value.screenDiagonalCm / 2.54,
    toFixedN
  )

  return screenData
}

const setObjectsPosition = (objects, slider) => {
  for (let i in objects)
    objects[i].style.top = slider.getBoundingClientRect().top + 50 + 'px'
}
