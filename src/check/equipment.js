import RemoteCalibrator from '../core'
import { constructInstructions, safeExecuteFunc } from '../components/utils'
import { phrases } from '../i18n/schema'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { setDefaultVideoPosition } from '../components/video'

RemoteCalibrator.prototype.getEquipment = async function (
  afterResultCallback,
  forcedGet = false,
) {
  if (this.equipment && !forcedGet) return safeExecuteFunc(afterResultCallback)

  this._replaceBackground()

  const video = document.querySelector('#webgazerVideoContainer')
  if (video) video.style.zIndex = 9999999999
  this.showVideo(false)

  const lang = this.language.value

  // Header: use RC_HowDoYouMeasure with fallback to RC_ChooseInchesOrCm
  const headerText = (
    phrases.RC_HowDoYouMeasure?.[lang] ||
    phrases.RC_ChooseInchesOrCm?.[lang] ||
    'How do you measure?'
  ).replace(/(?:\r\n|\r|\n)/g, '<br>')

  const pageHtml = constructInstructions(
    headerText,
    '',
    false,
    'bodyText',
    'left',
  )
  this._replaceBackground(pageHtml)

  // Create body container (constructInstructions omits it when body is empty)
  const container = document.querySelector('.calibration-instruction')
  let instructionBody = document.getElementById('instruction-body')
  if (!instructionBody && container) {
    instructionBody = document.createElement('div')
    instructionBody.id = 'instruction-body'
    instructionBody.className = 'calibration-description bodyText'
    container.appendChild(instructionBody)
  }

  if (!instructionBody) return

  instructionBody.style.pointerEvents = 'auto'
  instructionBody.innerHTML = ''

  // ---- Question 1: Unit selection ----
  const q1Label = document.createElement('p')
  q1Label.className = 'bodyText'
  q1Label.style.marginBottom = '0.5rem'
  q1Label.style.fontSize = '1.4rem'
  q1Label.innerHTML = phrases.RC_rulerUnit[lang].replace(
    /(?:\r\n|\r|\n)/g,
    '<br>',
  )
  instructionBody.appendChild(q1Label)

  const radioGroup = document.createElement('div')
  radioGroup.id = 'custom-radio-group'

  const unitOptions = [
    { value: 'inches', label: phrases.RC_Inches[lang] },
    { value: 'cm', label: phrases.RC_cm[lang] },
    { value: 'none', label: phrases.RC_NoRuler[lang] },
  ]

  unitOptions.forEach(option => {
    const label = document.createElement('label')
    label.className = 'bodyText'

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'equipment'
    radio.value = option.value
    radio.className = 'custom-input-class'

    label.appendChild(radio)
    label.appendChild(document.createTextNode(' ' + option.label))
    radioGroup.appendChild(label)
  })
  instructionBody.appendChild(radioGroup)

  // ---- Question 2: Ruler length (hidden until inches or cm is chosen) ----
  const q2Container = document.createElement('div')
  q2Container.id = 'ruler-length-container'
  q2Container.style.display = 'none'
  q2Container.style.marginTop = '2rem'

  const q2Label = document.createElement('p')
  q2Label.className = 'bodyText'
  q2Label.id = 'ruler-length-label'
  q2Label.style.fontSize = '1.4rem'
  q2Container.appendChild(q2Label)

  const lengthInput = document.createElement('input')
  lengthInput.type = 'number'
  lengthInput.id = 'ruler-length-input'
  lengthInput.min = '0'
  lengthInput.step = '1'
  lengthInput.style.width = '100%'
  lengthInput.style.maxWidth = '300px'
  lengthInput.style.padding = '8px'
  lengthInput.style.fontSize = '1.4rem'
  lengthInput.style.marginTop = '0.5rem'
  lengthInput.style.borderRadius = '4px'
  lengthInput.style.border = '1px solid #ccc'
  q2Container.appendChild(lengthInput)
  instructionBody.appendChild(q2Container)

  // ---- Proceed button (greyed out until both questions are answered) ----
  const buttonContainer = document.createElement('div')
  buttonContainer.style.marginTop = '2rem'

  const proceedButton = document.createElement('button')
  proceedButton.className = 'rc-button'
  proceedButton.textContent = phrases.T_proceed[lang]
  proceedButton.disabled = true
  proceedButton.style.border = '2px solid #ccc'
  proceedButton.style.backgroundColor = '#ccc'
  proceedButton.style.color = 'white'
  proceedButton.style.fontSize = '1.2rem'
  proceedButton.style.padding = '8px 16px'
  proceedButton.style.borderRadius = '4px'
  proceedButton.style.cursor = 'not-allowed'
  buttonContainer.appendChild(proceedButton)
  instructionBody.appendChild(buttonContainer)

  // ---- State & helpers ----
  let selectedUnit = null

  const enableProceed = () => {
    proceedButton.disabled = false
    proceedButton.style.backgroundColor = '#019267'
    proceedButton.style.borderColor = '#019267'
    proceedButton.style.cursor = 'pointer'
  }

  const disableProceed = () => {
    proceedButton.disabled = true
    proceedButton.style.backgroundColor = '#ccc'
    proceedButton.style.borderColor = '#ccc'
    proceedButton.style.cursor = 'not-allowed'
  }

  const updateProceedButton = () => {
    if (!selectedUnit) return disableProceed()
    if (selectedUnit === 'none') return enableProceed()
    // inches or cm: need a valid length
    const v = lengthInput.value
    if (v && !isNaN(v) && parseInt(v) > 0) {
      enableProceed()
    } else {
      disableProceed()
    }
  }

  // Radio change handler
  radioGroup.querySelectorAll('input[name="equipment"]').forEach(radio => {
    radio.addEventListener('change', () => {
      selectedUnit = radio.value
      if (selectedUnit === 'none') {
        q2Container.style.display = 'none'
        lengthInput.value = ''
      } else {
        q2Container.style.display = 'block'

        // Compute [[N1]] and [[N2]] for RC_howLong placeholders
        const cmPerUnit = selectedUnit === 'inches' ? 2.54 : 1
        const distCheckCm = this._calibrateDistanceCheckCmForEquipment || []
        const minRulerCm = this._calibrateDistanceCheckMinRulerCm || 0
        const maxDistCm =
          distCheckCm.length > 0
            ? Math.max(...distCheckCm.map(Number))
            : 0
        const n1 = minRulerCm > 0 ? Math.round(minRulerCm / cmPerUnit) : ''
        const n2 = maxDistCm > 0 ? Math.round(maxDistCm / cmPerUnit) : ''

        const howLongText = (phrases.RC_howLong[lang] || '')
          .replace(/\[\[AAA\]\]/g, selectedUnit)
          .replace(/AAA/g, selectedUnit)
          .replace(/\[\[N1\]\]/g, n1)
          .replace(/\[\[N2\]\]/g, n2)
        q2Label.innerHTML = howLongText.replace(/(?:\r\n|\r|\n)/g, '<br>')
        lengthInput.focus()
      }
      updateProceedButton()
    })
  })

  // Length input handler
  lengthInput.addEventListener('input', updateProceedButton)

  // ---- Wait for user to click Proceed ----
  const result = await new Promise(resolve => {
    proceedButton.onclick = () => {
      if (proceedButton.disabled) return
      resolve({
        unit: selectedUnit,
        length: selectedUnit !== 'none' ? lengthInput.value : null,
      })
    }

    // Enter key on length input triggers proceed
    lengthInput.addEventListener('keyup', event => {
      if (event.key === 'Enter' && !proceedButton.disabled) {
        proceedButton.click()
      }
    })

    // Enter key on radio buttons triggers proceed
    radioGroup.querySelectorAll('.custom-input-class').forEach(input => {
      input.addEventListener('keyup', event => {
        if (event.key === 'Enter' && !proceedButton.disabled) {
          proceedButton.click()
        }
      })
    })

    // Keypad handler support
    if (this.keypadHandler) {
      setUpEasyEyesKeypadHandler(
        null,
        this.keypadHandler,
        () => {
          if (!proceedButton.disabled) {
            proceedButton.click()
          }
        },
        false,
        ['return'],
        this,
      )
    }
  })

  // ---- Build output data (same structure as before) ----
  const hasEquipment = result.unit !== 'none'

  const data = {
    value: {
      has: hasEquipment,
      unit: hasEquipment ? result.unit : null,
      equipment: hasEquipment ? '' : null,
      length: hasEquipment ? result.length : null,
    },
    timestamp: performance.now(),
  }

  this.rulerUnits = hasEquipment ? result.unit : null
  if (hasEquipment) {
    this.rulerLength = result.length
    data.value.length = result.length
  }
  this.newEquipmentData = data

  // Show video again and position properly
  this.showVideo(true)
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (videoContainer) {
    setDefaultVideoPosition(this, videoContainer)
  }

  return safeExecuteFunc(afterResultCallback)
}
