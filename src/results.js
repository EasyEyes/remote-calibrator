/**
 *
 * Please refer to this object for the pattern of data storage of the Toolbox
 *
 */
const data = {
  screen: {
    width: undefined,
    height: undefined,
    diagonal: undefined,
    size: undefined, // Same as diagonal
    ppi: undefined,
    rppi: undefined, // Corrected PPI of retina displays
    // & timestamp
  },
  viewingDistance: undefined, // d, timestamp
  gazePosition: undefined, // x, y, timestamp
}

export default data
