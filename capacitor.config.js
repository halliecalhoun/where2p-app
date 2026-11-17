/**
 * iOS identity. `appId` is the bundle id registered for the existing
 * Where2P App Store Connect app.
 *
 * It must match the Xcode target's Bundle Identifier (App target →
 * Signing & Capabilities, or General → Identity) and the App ID in the
 * Apple Developer portal. `npx cap sync` copies this file into the app,
 * but it does not rewrite an existing Xcode bundle id. Display name is
 * `appName` here and CFBundleDisplayName in ios/App/App/Info.plist.
 * See docs/APP_STORE.md.
 */
const config = {
  appId: "com.where2p.where2p",
  appName: "Where2P",
  webDir: "www",
  backgroundColor: "#007c91",
  ios: {
    backgroundColor: "#007c91",
    // CSS env(safe-area-inset-*) is the only inset. "automatic" would pad twice.
    contentInset: "never",
    // Phone layout inside WKWebView, including on iPad if that target is enabled later.
    preferredContentMode: "mobile",
    // OpenStreetMap's tile policy wants an identifiable user agent.
    appendUserAgent: "Where2P",
    // Do not set limitsNavigationsToAppBoundDomains. Leaving it false lets the
    // map tiles, Photon, Refuge Restrooms, and Firebase load.
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      // Same teal as the splash artwork and LaunchScreen.storyboard.
      // iOS draws that image with scaleAspectFit, so this color fills the
      // bars around the square logo instead of cropping it.
      backgroundColor: "#007c91",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      // Capacitor's "DARK" style is white status-bar content on a dark bar.
      style: "DARK",
      backgroundColor: "#007c91",
    },
  },
};

module.exports = config;
