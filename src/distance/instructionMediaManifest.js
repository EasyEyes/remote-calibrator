import { parseInstructions } from './instructionParserAdapter.js'
import { getStepInstructionMediaUrl } from './stepByStepInstructionHelps.js'
import {
  buildLocationInstructions,
  getMeasurementLocationPhraseKey,
  getObjectMeasurementPhraseKey,
  parseLocationsArray,
} from './object/locationInstructions.js'

export function collectInstructionMediaUrls(
  phrases,
  assetMap,
  language = 'en',
  calibrationTasks = [],
) {
  const urls = new Set()
  const textFor = key => phrases[key]?.[language] || ''
  const addText = (text, key, format) => {
    const model = parseInstructions(text, { assetMap, format })
    for (const { sectionIdx, stepIdx } of model.flatSteps) {
      const section = model.sections[sectionIdx]
      const url = getStepInstructionMediaUrl(
        section,
        section?.steps?.[stepIdx],
      )?.trim()
      if (!url) continue
      try {
        new URL(url, 'https://easyeyes.invalid/')
      } catch {
        throw new Error(
          `Invalid instruction media URL in ${key} [${language}]: ${url}`,
        )
      }
      urls.add(url)
    }
  }
  const addPhrase = (key, format) => addText(textFor(key), key, format)

  for (const { name, options = {} } of calibrationTasks) {
    if (name !== 'trackDistance' && name !== 'measureDistance') continue
    if (options.calibrateDistanceCheckBool || options.check) {
      const key = 'RC_produceDistanceLocation'
      const checking = String(options.calibrateDistanceChecking || '')
        .toLowerCase()
        .split(',')
        .map(option => option.trim())
      const text = textFor(key)
        .replaceAll(
          '[[TS]]',
          checking.includes('tiltandswivel') ? textFor('RC_tiltAndSwivel') : '',
        )
        .replaceAll(
          '[[SSS]]',
          textFor(
            options.saveSnapshots ? 'RC_snapshot' : 'RC_temporarySnapshot',
          ),
        )
      addText(text, key)
    }
    if (name !== 'trackDistance') continue

    const { useObjectTestData: method, objectMeasurementCount = 2 } = options
    if (!method || method === 'typical') continue
    if (method === 'creditCard') {
      addPhrase('RC_UseObjectToSetViewingDistanceCreditCardPage3')
      if (objectMeasurementCount > 1)
        addPhrase('RC_UseObjectToSetViewingDistanceRepeatCreditCardPage4')
      continue
    }
    if (method === 'justCreditCard' || method === 'autoCreditCard') {
      addPhrase('RC_UseCreditCardBelowToCalibrateCameraPage3')
      if (objectMeasurementCount > 1)
        addPhrase('RC_UseCreditCardBelowToCalibrateCameraRepeatPage4')
      continue
    }

    if (method === 'paper') {
      const key = 'RC_UseLongEdge'
      addText(
        textFor(key).replaceAll('/n', '\n').replaceAll('\\n', '\n'),
        key,
        'markdown',
      )
    } else {
      const showLength = !!options.calibrateDistanceShowRulerUnitsBool
      addPhrase(getObjectMeasurementPhraseKey(showLength, true))
      if (objectMeasurementCount > 1)
        addPhrase(getObjectMeasurementPhraseKey(showLength, false))
    }

    const key = getMeasurementLocationPhraseKey(phrases, language)
    if (key.includes('ToLocation')) {
      // The participant can change hands. Include both choices at each
      // configured location, using the same placeholder expansion as playback.
      for (const location of new Set(
        parseLocationsArray(options.calibrateDistanceLocations),
      )) {
        for (const preferRightHand of [true, false]) {
          addText(
            buildLocationInstructions(
              key,
              location,
              preferRightHand,
              options.saveSnapshots,
              language,
              phrases,
            ),
            key,
          )
        }
      }
    } else if (key) {
      addPhrase(key)
    }
  }
  return [...urls]
}
