// Temporary comparison mapping using the exact original and -C links
// supplied for the local compression test. Keep other phrase URLs as-is.
const compressedUrls = new Map([
  [
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FStiff%20objects.png?alt=media&token=8acfda00-fb5d-444c-8976-0835a3881512',
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FStiff%20objects-C.png?alt=media&token=5ca5f093-8077-490b-8e39-1be5c7d8c9bc',
  ],
  [
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.1.mp4?alt=media&token=487e8498-41e8-409d-a93f-d4cfd24630a8',
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.1-C.mp4?alt=media&token=970439ef-2ba0-44b1-8d38-ceb1757e80f1',
  ],
  [
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FImage_1.1.png?alt=media&token=e113bd5f-c16c-49af-97b6-471050e94d8c',
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FImage_1.1-C.png?alt=media&token=0eded6b8-1927-4d97-a028-6b0382378d37',
  ],
  [
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.2.mp4?alt=media&token=1bbabd66-1b31-42cf-9344-e8df8fdb55e7',
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.2-C.mp4?alt=media&token=0ca55ee6-f958-4c5c-a7f8-b132e599b38b',
  ],
  [
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.4.mp4?alt=media&token=40d4c197-2c4c-4b79-a8e4-3a085a26529f',
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.4-C.mp4?alt=media&token=70157a85-7c2a-43b2-bcfa-ef1d80ee69b8',
  ],
  [
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction_1.5.mp4?alt=media&token=ed833e71-9b8c-4088-bf37-1b03ceca684c',
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction_1.5-C.mp4?alt=media&token=acfff0db-4f72-4660-9726-22a0bd8f2be4',
  ],
  [
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction_1.6.mp4?alt=media&token=e6230fd1-f24a-48b5-8394-48cbc9c79c7e',
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction_1.6-C.mp4?alt=media&token=9a2e19f0-ca3d-484d-a327-f696aee03809',
  ],
  [
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%204%20(Revis%202).mp4?alt=media&token=803b2cfe-52d3-43d7-9f97-f36bf8e844a6',
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%204%20(Revis%202)-C.mp4?alt=media&token=7bd858b3-7b6a-4ecb-abfe-85cf6601c9b8',
  ],
])

const firebaseMediaBase =
  'https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/'
const mediaProxyBase = 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/'

export function getInstructionMediaDownloadUrl(url, compressed = false) {
  // Phrase authors may paste direct Firebase links. Download through the
  // existing proxy so the browser can read the response into a Blob.
  const downloadUrl = url.startsWith(firebaseMediaBase)
    ? mediaProxyBase + url
    : url
  return compressed
    ? (compressedUrls.get(downloadUrl) ?? downloadUrl)
    : downloadUrl
}
