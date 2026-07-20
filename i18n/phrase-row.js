function splitPhraseRow(phrase) {
  const { EE_LanguageCode, ...translations } = phrase
  return { phraseKey: EE_LanguageCode, translations }
}

module.exports = { splitPhraseRow }
