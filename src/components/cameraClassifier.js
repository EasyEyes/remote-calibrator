/**
 * Score a camera label as built-in / external / unknown.
 * Score >= 0.5 -> built-in, < 0 -> external, otherwise unknown.
 */

export const classify = score => {
  if (score >= 0.5) return 'built-in'
  if (score < 0) return 'external'
  return 'unknown'
}

export const likelyBuiltIn = device => {
  const raw = (device?.label || '').trim()
  if (!raw) return { score: 0, classification: 'unknown' }
  const l = raw.toLowerCase()

  let score = 0

  // POSITIVE -- looks like a built-in / fixed camera.
  if (/\b(integrated|built[-\s]?in|facetime|isight)\b/.test(l)) score += 1
  // Apple Silicon Macs report the built-in cam as "MacBook Pro Camera" etc.
  if (/\b(macbook|imac)\b/.test(l)) score += 1
  if (/\bstudio\s*display\b/.test(l)) score += 1
  if (/\beasycamera\b/.test(l)) score += 1
  if (/\b(hd|fhd|uhd)\s*camera\b/.test(l)) score += 0.3

  // NEGATIVE -- distinctive external / clip-on cameras.
  if (
    /\b(logitech|brio|streamcam|c\s*9\d{2}|c\s*615|c\s*270|mx\s*brio|lifecam)\b/.test(
      l,
    )
  )
    score -= 1
  if (
    /\b(razer|kiyo|elgato|anker|insta360|ausdom|depstech|nexigo|emeet)\b/.test(
      l,
    )
  )
    score -= 1
  if (
    /\b(avermedia|obsbot|facecam|j5create|jabra|papalook|vitade|tolulu|sandberg|creative)\b/.test(
      l,
    )
  )
    score -= 1
  // External monitor with built-in cam (not on the laptop screen).
  if (/\bdell\s*ultrasharp\b/.test(l)) score -= 1
  // Continuity Camera (iPhone-as-webcam) is not fixed to the screen.
  if (/\b(iphone|continuity\s*camera)\b/.test(l)) score -= 1
  // Virtual / streaming software cameras.
  if (
    /\b(obs|ndi|manycam|snap\s*camera|xsplit|droidcam|epoccam|camo)\b/.test(l)
  )
    score -= 1

  return { score, classification: classify(score) }
}
