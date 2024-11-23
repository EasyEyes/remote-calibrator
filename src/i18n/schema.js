/*
  Do not modify this file! Run npm `npm run phrases` at ROOT of this project to fetch from the Google Sheets.
  https://docs.google.com/spreadsheets/d/1UFfNikfLuo8bSromE34uWDuJrMPFiJG3VpoQKdCGkII/edit#gid=0
*/

const phrasesData = ["EE_languageNameEnglish","EE_languageNameNative","EE_languageDirection","EE_languageUseSpace","EE_phraseSource","RC_cancel","RC_distanceTracking","RC_distanceTrackingCloseL","RC_distanceTrackingCloseR","RC_distanceTrackingGuide","RC_distanceTrackingIntroEnd","RC_distanceTrackingIntroStart","RC_distanceTrackingMoveCloser","RC_distanceTrackingMoveFurther","RC_rulerUnit","RC_howLong","RC_produceDistance","RC_TestDistances","RC_canUsePhoneKeypad","RC_distanceTrackingRedo","RC_distanceTrackingTitle","RC_errorCameraUseDenied","RC_errorNoCamera","RC_gazeTracking","RC_gazeTrackingIntro","RC_gazeTrackingNudge","RC_gazeTrackingTitle","RC_nearPointIntro","RC_nearPointTitle","RC_ok","RC_panelButton","RC_panelIntro","RC_panelTitle","RC_panelTitleNext","RC_panelIntroNext","RC_panelUsesWebcam","RC_panelUsesWebcamPhone","RC_performance","RC_performanceIntro","RC_performanceTitle","RC_privacyCamera","RC_requestCamera","RC_screenSize","RC_screenSizeCredit","RC_screenSizeCreditCard","RC_screenSizeHave","RC_screenSizeIntro","RC_screenSizeTitle","RC_screenSizeUSBA","RC_screenSizeUSBC","RC_starting","RC_viewingBlindSpotCredit","RC_viewingBlindSpotRejected","RC_viewingDistance","RC_viewingDistanceIntroTitle","RC_viewingDistanceIntroLiMethod","RC_viewingDistanceTitle"]
const languages = ["en-US","ar","hy","bg","zh-CN","zh-HK","hr","cs","da","nl","en-UK","fi","fr","de","el","he","hi","hu","is","id","it","ja","kn","ko","lt","ms","ml","no","fa","pl","pt","ro","ru","sr","es","sw","sv","tl","tr","ur"]

export const phrases = {}

phrasesData.map(phrase => {
  phrases[phrase] = {}

  languages.map(language => {
    phrases[phrase][language] = ''
  })
})
