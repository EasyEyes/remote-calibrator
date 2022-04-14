export const degToPix = (deg, ppi, viewingDistanceCm) => {
  return ppiToPxPerCm(ppi) * viewingDistanceCm * Math.tan(deg * (Math.PI / 180))
}

export const ppiToPxPerCm = ppi => {
  return ppi / 2.54
}
