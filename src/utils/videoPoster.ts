/**
 * A 1×1 transparent GIF for `<video poster>` (APP-003 / APP-007).
 *
 * Android WebView draws its own default poster — a large grey play button,
 * stretched to the element — for any <video> without a `poster` that has no
 * frame to show yet. On the QR screens that is exactly the moments the camera
 * is not streaming: behind the permission dialog, while the stream starts, and
 * after the stream stops on the way out. It comes from
 * WebChromeClient.getDefaultVideoPoster(), not from the media controls, which is
 * why hiding `::-webkit-media-controls-*` in CSS never removed it. Supplying a
 * poster of our own replaces it with nothing.
 */
export const TRANSPARENT_VIDEO_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
