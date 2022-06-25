import { phrases } from '../i18n'
import { safeExecuteFunc } from '../components/utils'

/**
 * USE
 * 0 - Nothing
 * 1 - Screen
 * 2 - Screen and webcam
 * 3 - Screen, webcam, and smartphone
 */
export const _validTaskList = {
  screenSize: {
    use: 1,
    name: phrases.RC_screenSize['en-US'],
    phraseHandle: 'RC_screenSize',
  },
  measureDistance: {
    use: 1,
    name: phrases.RC_viewingDistance['en-US'],
    phraseHandle: 'RC_viewingDistance',
  },
  trackDistance: {
    use: 2,
    name: phrases.RC_distanceTracking['en-US'],
    phraseHandle: 'RC_distanceTracking',
  },
  trackGaze: {
    use: 2,
    name: phrases.RC_gazeTracking['en-US'],
    phraseHandle: 'RC_gazeTracking',
  },
  performance: {
    use: 1,
    name: phrases.RC_performance['en-US'],
    phraseHandle: 'RC_performance',
  },
}

export const _validTaskListNames = Object.keys(_validTaskList)

export const _validateTask = task => {
  if (!Array.isArray(task)) return false
  for (let t of task) {
    if (!t) return false

    if (typeof t === 'object' && t.name.includes('[') && t.name.includes(']'))
      if (!t.function || typeof t.function !== 'function') return false
      else continue

    if (typeof t === 'object' && !_validTaskListNames.includes(t.name))
      return false
    else if (typeof t === 'string' && !_validTaskListNames.includes(t))
      return false
  }
  return true
}

export const _finishStepAt = index => {
  document.querySelectorAll('.rc-panel-step').forEach(e => {
    if (Number(e.dataset.index) === index) {
      e.classList.replace('rc-panel-step-todo', 'rc-panel-step-finished')
      e.classList.replace('rc-panel-step-active', 'rc-panel-step-inactive')
    }
  })
}

export const _getTaskName = task => {
  if (typeof task === 'string') return task
  return task.name
}

export const _isValidCustomizedName = taskName => {
  return (
    taskName &&
    taskName.length > 2 &&
    taskName[0] === '[' &&
    taskName[taskName.length - 1] === ']'
  )
}

export const _parseCustomizedName = taskName => {
  return taskName.slice(1, -1)
}

export const _getTaskOptionsCallbacks = (
  task,
  fixedTaskCallback = null,
  finalCallback = null,
  fixedFinalCallback = null
) => {
  if (typeof task === 'string')
    task = {
      name: task,
    }

  const getFinalCallbacks = () => {
    // Task
    safeExecuteFunc(fixedTaskCallback)
    // Panel
    safeExecuteFunc(finalCallback, { timestamp: performance.now() })
    safeExecuteFunc(fixedFinalCallback)
  }

  if (['screenSize', 'measureDistance', 'performance'].includes(task.name)) {
    return [
      task.options || {},
      data => {
        safeExecuteFunc(task.callback, data)
        getFinalCallbacks()
      },
    ]
  } else if ('trackGaze' === task.name) {
    return [
      task.options || {},
      data => {
        safeExecuteFunc(task.callbackOnCalibrationEnd, data)
        getFinalCallbacks()
      },
      task.callbackTrack || null,
    ]
  } else if ('trackDistance' === task.name) {
    return [
      task.options || {},
      data => {
        safeExecuteFunc(task.callbackStatic, data)
        getFinalCallbacks()
      },
      task.callbackTrack || null,
    ]
  }
}

export const _clearPanelIntervals = RC => {
  RC._panelStatus.panelResolveIntervals.forEach(i => clearInterval(i))
  RC._panelStatus.panelResolveIntervals = []
}

export const _setLanguagePicker = (RC, parent, darkerColor) => {
  let langInner = `<select name="rc-lang" id="rc-panel-lang-picker" style="color: ${darkerColor} !important">`
  for (let lang of RC.supportedLanguages)
    if (RC.L === lang.language)
      langInner += `<option value="${lang.language}" selected>${lang.languageNameNative}</option>`
  for (let lang of RC.supportedLanguages)
    if (RC.L !== lang.language)
      langInner += `<option value="${lang.language}">${lang.languageNameNative}</option>`
  langInner += '</select>'
  parent.innerHTML = langInner

  document.querySelector('#rc-panel-lang-picker').onchange = () => {
    RC.newLanguage(document.querySelector('#rc-panel-lang-picker').value)
    RC.resetPanel()
  }
}
