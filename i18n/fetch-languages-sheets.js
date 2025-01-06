const process = require('node:process')
const fs = require('node:fs')
const XLSX = require('xlsx')
const google = require('googleapis')

const auth = new google.Auth.GoogleAuth({
  keyFile: `${__dirname}/credentials.json`,
  scopes: 'https://www.googleapis.com/auth/spreadsheets',
})

async function processLanguageSheet() {
  const spreadsheetId = '1UFfNikfLuo8bSromE34uWDuJrMPFiJG3VpoQKdCGkII'
  const googleSheets = new google.sheets_v4.Sheets()
  const rows = await googleSheets.spreadsheets.values.get({
    auth,
    spreadsheetId,
    range: 'Translations',
  })

  const rowsJSON = XLSX.utils.sheet_to_json(
    XLSX.utils.aoa_to_sheet(rows.data.values),
    {
      defval: '',
    },
  )

  const data = {}
  for (const phrase of rowsJSON) {
    const { language, ...translations } = phrase

    if (
      [
        'EE_languageNameEnglish',
        'EE_languageNameNative',
        'EE_languageDirection',
        'EE_phraseSource',
        'EE_languageUsesSpacesBool',
        /* -------------------------------------------------------------------------- */
        // General
        'RC_ok',
        'RC_cancel',
        'RC_starting',
        'RC_requestCamera',
        'RC_privacyCamera',
        'RC_errorCameraUseDenied',
        'RC_errorNoCamera',
        'RC_canUsePhoneKeypad',

        // Performance
        'RC_performanceTitle',
        'RC_performanceIntro',
        'RC_performance',

        // Screen Size
        'RC_screenSizeTitle',
        'RC_screenSizeIntro',
        'RC_screenSizeHave',
        'RC_screenSizeUSBA',
        'RC_screenSizeUSBC',
        'RC_screenSizeCreditCard',
        'RC_screenSizeCredit',
        'RC_screenSize',

        // Distance Tracking
        'RC_distanceTrackingCloseL',
        'RC_distanceTrackingCloseR',
        'RC_distanceTrackingTitle',
        'RC_distanceTrackingIntroStart',
        'RC_distanceTrackingIntroEnd',
        'RC_distanceTrackingRedo',
        'RC_distanceTrackingGuide1',
        'RC_distanceTrackingMoveCloser',
        'RC_distanceTrackingMoveFarther',
        'RC_distanceTracking',
        'RC_viewingDistanceIntroLiMethod',
        'RC_viewingDistanceIntroTitle',
        'RC_viewingDistanceTitle',
        'RC_viewingDistance',

        // Track Distance Check
        'RC_TestDistances',
        'RC_rulerUnit',
        'RC_howLong',
        'RC_produceDistance',
        'T_proceed',
        'RC_produceDistanceTitle',
        'RC_produceDistanceTitle1',
        'RC_produceDistanceTitle2',
        'EE_FullScreenOk',
        'RC_AllDistancesRecorded',

        // Viewing Blind Spot
        'RC_viewingBlindSpotCredit',
        'RC_viewingBlindSpotRejected',

        // Near Point
        'RC_nearPointTitle',
        'RC_nearPointIntro',

        // Gaze Tracking
        'RC_gazeTrackingTitle',
        'RC_gazeTrackingIntro',
        'RC_gazeTrackingNudge',
        'RC_gazeTracking',

        // Panel
        'RC_panelTitle',
        'RC_panelIntro',
        'RC_panelTitleNext',
        'RC_panelIntroNext',
        'RC_panelButton',
        'RC_panelUsesWebcam',
        'RC_panelUsesWebcamPhone',
      ].includes(language)
    )
      data[language] = translations
  }

  for (const phrase in data) {
    for (const lang in data[phrase]) {
      if (data[phrase][lang].includes('Loading') && lang !== 'en-US') {
        console.error(
          new Error(
            `Phrases are not ready for ${lang} yet. Please try again later.`,
          ),
        )
        return false
      }

      // data[phrase][lang] = ''

      // Placeholders
      data[phrase][lang] = data[phrase][lang]
        .replace(/XXX/g, 'xxx')
        .replace(/XX/g, 'xx')
      // Spaces
      data[phrase][lang] = data[phrase][lang].replace(/%/g, '&nbsp')
      // line breaks
      data[phrase][lang] = data[phrase][lang].replace(/~/g, '<br />')
    }
  }

  // ! schema
  // create i18n assembler
  const dataPhrases = Object.keys(data)
  const dataLanguages = Object.keys(data[dataPhrases[0]])

  const exportWarning = `/*
  Do not modify this file! Run npm \`npm run phrases\` at ROOT of this project to fetch from the Google Sheets.
  https://docs.google.com/spreadsheets/d/1UFfNikfLuo8bSromE34uWDuJrMPFiJG3VpoQKdCGkII/edit#gid=0
*/\n\n`

  const exportData = `const phrasesData = ${JSON.stringify(dataPhrases)}\nconst languages = ${JSON.stringify(
    dataLanguages,
  )}\n\n`

  const i18nAssembler = `export const phrases = {}

phrasesData.map(phrase => {
  phrases[phrase] = {}

  languages.map(language => {
    phrases[phrase][language] = ''
  })
})`

  fs.writeFile(
    `${process.cwd()}/src/i18n/schema.js`,
    `${exportWarning + exportData + i18nAssembler}\n`,
    error => {
      if (error) {
        console.log("Error! Couldn't write to the file.", error)
      } else {
        console.log(
          'EasyEyes International Phrases fetched and written into files successfully.',
        )
      }
    },
  )

  // ! actual
  const exportHandle = 'export const remoteCalibratorPhrases ='

  fs.writeFile(
    `${process.cwd()}/src/i18n/phrases.js`,
    `${exportWarning + exportHandle + JSON.stringify(data)}\n`,
    error => {
      if (error) {
        console.log("Error! Couldn't write to the file.", error)
      } else {
        console.log(
          'EasyEyes International Phrases fetched and written into files successfully.',
        )
      }
    },
  )
}

require('node:dns').resolve('www.google.com', function (err) {
  if (err) {
    console.log('No internet connection. Skip fetching phrases.')
  } else {
    console.log('Fetching up-to-date phrases...')
    processLanguageSheet()
  }
})
