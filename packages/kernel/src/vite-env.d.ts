// Declares Vite's `?url` asset imports for standalone type-checking of the
// browser loader (oc.browser.ts). At runtime Vite resolves these to URL strings.
declare module "*?url" {
  const url: string;
  export default url;
}
