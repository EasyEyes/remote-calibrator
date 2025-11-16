// Shared instruction media blob cache and URL resolver for step instructions.
// This centralizes media caching so both the main distance flow and
// the check-distance flow reuse the same blobs.

// A Map of url -> { objectUrl, blob, mime }
const mediaBlobCache =
  (typeof window !== 'undefined' &&
    (window.__eeInstructionMediaBlobCache =
      window.__eeInstructionMediaBlobCache || new Map())) ||
  new Map()

// A Map of url -> in-flight Promise resolving to the same entry as mediaBlobCache
const mediaFetchCache =
  (typeof window !== 'undefined' &&
    (window.__eeInstructionMediaFetchCache =
      window.__eeInstructionMediaFetchCache || new Map())) ||
  new Map()

// Fetch a blob for the given URL at most once, storing it in the cache.
export const fetchBlobOnce = url => {
  if (!url) return Promise.resolve(null)
  if (mediaBlobCache.has(url)) return Promise.resolve(mediaBlobCache.get(url))
  if (mediaFetchCache.has(url)) return mediaFetchCache.get(url)

  const p =
    typeof fetch === 'function'
      ? fetch(url, { mode: 'cors', credentials: 'omit' })
          .then(resp => {
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            return resp.blob()
          })
          .then(blob => {
            const objectUrl = URL.createObjectURL(blob)
            const entry = { objectUrl, blob, mime: blob.type }
            mediaBlobCache.set(url, entry)
            return entry
          })
          .catch(() => null)
      : Promise.resolve(null)

  mediaFetchCache.set(url, p)
  return p
}

// Resolve a media URL to a cached blob URL if available.
// On cache miss, kick off a lazy fetch to populate cache for next use.
export const resolveInstructionMediaUrl = url => {
  if (!url) return url
  const key = String(url).trim()
  const cached = mediaBlobCache && mediaBlobCache.get(key)
  if (cached && cached.objectUrl) return cached.objectUrl

  // Lazy warm the cache so subsequent renders use the blob URL
  if (!mediaFetchCache.has(key)) {
    try {
      fetchBlobOnce(key)
    } catch {
      // ignore errors in lazy warm
    }
  }
  return key
}
