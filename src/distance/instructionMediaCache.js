// Shared instruction media blob cache and URL resolver for step instructions.
// This centralizes media caching so both the main distance flow and
// the check-distance flow reuse the same blobs.

import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { getFullscreen, isFullscreen } from '../components/utils'
import { phrases } from '../i18n/schema'

const MEDIA_FETCH_ATTEMPTS = 3
const MEDIA_FETCH_TIMEOUT_MS = 45000
const MEDIA_FETCH_BACKOFF_MS = 1000

const mediaBlobCache =
  (typeof window !== 'undefined' &&
    (window.__eeInstructionMediaBlobCache =
      window.__eeInstructionMediaBlobCache || new Map())) ||
  new Map()

const mediaFetchCache =
  (typeof window !== 'undefined' &&
    (window.__eeInstructionMediaFetchCache =
      window.__eeInstructionMediaFetchCache || new Map())) ||
  new Map()

let _mediaRetryPrompt = null

const _sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const _fetchBlobWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.blob()
  } finally {
    clearTimeout(timer)
  }
}

const _promptMediaRetry = async RC => {
  if (_mediaRetryPrompt) return _mediaRetryPrompt

  _mediaRetryPrompt = (async () => {
    const loading = document.getElementById('rc-loading-video-message')
    if (loading) loading.style.visibility = 'hidden'

    // Look up the translated phrase; fall back to the English copy in
    // the phrases sheet, then to the hardcoded English default so the
    // popup never renders blank if the phrase key is missing.
    const englishDefault =
      'This study couldn’t download required files. Check your internet ' +
      'connection, then click Try Again. If that doesn’t work, ' +
      'reload this page to restart the study.'
    const message =
      phrases.RC_errorFailedToLoadMedia?.[RC.L] ||
      phrases.RC_errorFailedToLoadMedia?.['en-US'] ||
      englishDefault
    await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: true }),
      icon: 'error',
      iconColor: RC._CONST.COLOR.DARK_RED,
      html: message,
      showConfirmButton: true,
      showCancelButton: false,
      confirmButtonText: phrases.RC_TryAgain?.[RC.L] || 'Try again',
    })

    // Try Again is a user gesture, so we can restore fullscreen if the
    // participant left it to check their connection.
    if (!isFullscreen()) {
      await getFullscreen(RC.L, RC)
    }

    if (loading) loading.style.visibility = ''
  })()

  try {
    await _mediaRetryPrompt
  } finally {
    _mediaRetryPrompt = null
  }
}

const _fetchBlobWithBackoff = async url => {
  let lastError
  for (let attempt = 1; attempt <= MEDIA_FETCH_ATTEMPTS; attempt++) {
    try {
      return await _fetchBlobWithTimeout(url, MEDIA_FETCH_TIMEOUT_MS)
    } catch (error) {
      lastError = error
    }
    if (attempt < MEDIA_FETCH_ATTEMPTS) {
      const delayMs = MEDIA_FETCH_BACKOFF_MS * 2 ** (attempt - 1)
      console.warn(
        `[RC] Media fetch attempt ${attempt}/${MEDIA_FETCH_ATTEMPTS} failed, retrying in ${delayMs}ms:`,
        url,
        lastError?.message || lastError,
      )
      await _sleep(delayMs)
    }
  }
  throw lastError
}

export const fetchBlobOnce = (url, RC = null) => {
  if (!url) return Promise.resolve(null)
  if (mediaBlobCache.has(url)) return Promise.resolve(mediaBlobCache.get(url))
  if (mediaFetchCache.has(url)) return mediaFetchCache.get(url)

  const p = (async () => {
    try {
      const blob = await _fetchBlobWithBackoff(url)
      const objectUrl = URL.createObjectURL(blob)
      const entry = { objectUrl, blob, mime: blob.type }
      mediaBlobCache.set(url, entry)
      return entry
    } catch (lastError) {
      mediaFetchCache.delete(url)
      console.error('[RC] Media fetch failed after backoff:', url, lastError)

      if (RC) {
        await _promptMediaRetry(RC)
        return fetchBlobOnce(url, RC)
      }
      return null
    }
  })()

  mediaFetchCache.set(url, p)
  return p
}

export const resolveInstructionMediaUrl = url => {
  if (!url) return url
  const key = String(url).trim()
  const cached = mediaBlobCache && mediaBlobCache.get(key)
  if (cached && cached.objectUrl) return cached.objectUrl

  if (!mediaFetchCache.has(key)) {
    try {
      fetchBlobOnce(key)
    } catch {
      // ignore errors in lazy warm
    }
  }
  return key
}
