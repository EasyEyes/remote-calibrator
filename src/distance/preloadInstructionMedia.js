import RemoteCalibrator from '../core'
import { phrases } from '../i18n/schema'
import { test_assetMap } from './assetMap'
import { getInstructionMediaDownloadUrl } from './instructionMediaDownloadUrl'
import { collectInstructionMediaUrls } from './instructionMediaManifest'
import {
  cacheInstructionMedia,
  sealInstructionMedia,
} from './instructionMediaCache'

RemoteCalibrator.prototype.getInstructionMediaUrls = function ({
  calibrationTasks,
  compressed,
} = {}) {
  const urls = collectInstructionMediaUrls(
    phrases,
    test_assetMap,
    this.L,
    calibrationTasks,
  )
  return [
    ...new Set(
      urls.map(url => getInstructionMediaDownloadUrl(url, compressed)),
    ),
  ]
}

RemoteCalibrator.prototype.preloadInstructionMedia = async function ({
  loadBlob,
  calibrationTasks,
  compressed,
}) {
  const urls = collectInstructionMediaUrls(
    phrases,
    test_assetMap,
    this.L,
    calibrationTasks,
  )
  for (const url of urls) {
    const downloadUrl = getInstructionMediaDownloadUrl(url, compressed)
    // Playback resolves the phrase URL to the chosen bytes without changing
    // the stored phrase or having to fetch the original URL later.
    cacheInstructionMedia(url, await loadBlob(downloadUrl))
  }
  sealInstructionMedia()
}
