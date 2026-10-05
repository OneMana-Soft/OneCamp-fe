// The Permissions-Policy header (next.config.ts). Kept here, in one list, so
// a test can hold the features the product needs open.
//
// Names browsers don't recognise (ambient-light-sensor, battery,
// document-domain) were dropped: they did nothing but log a console warning
// on every page.
export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=(self)",
  "camera=(self)",
  "display-capture=(self)",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=(self)",
  "midi=()",
  "payment=()",
  "picture-in-picture=(self)",
  "publickey-credentials-create=(self)",
  "publickey-credentials-get=(self)",
  "screen-wake-lock=()",
  "sync-xhr=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ")
