const replacePhraseToken = (phrase, selectHtml) => {
  return phrase.replace('[[XXX]]', selectHtml)
}

export { replacePhraseToken }
