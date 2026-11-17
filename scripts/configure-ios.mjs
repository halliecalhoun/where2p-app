import { readFileSync, writeFileSync } from "node:fs";

// Re-applied after `cap sync` so a regenerated Info.plist keeps the App Store keys.
// Bundle id and device family live in the Xcode project; this script does not
// change them. See docs/APP_STORE.md.
//
// The launch storyboard is also pinned to scaleAspectFit. @capacitor/assets
// copies assets/splash.png into a square Splash image, and scaleAspectFill
// crops that wordmark on tall iPhones. The storyboard background is the same
// teal as the artwork, so the fitted bars are invisible.

const storyboardPath = "ios/App/App/Base.lproj/LaunchScreen.storyboard";
let storyboard = readFileSync(storyboardPath, "utf8");
if (storyboard.includes('contentMode="scaleAspectFill"')) {
  storyboard = storyboard.replaceAll('contentMode="scaleAspectFill"', 'contentMode="scaleAspectFit"');
  writeFileSync(storyboardPath, storyboard);
  console.log("Updated", storyboardPath, "to scaleAspectFit");
} else if (!storyboard.includes('contentMode="scaleAspectFit"')) {
  console.error(storyboardPath, "has no splash contentMode to keep on scaleAspectFit");
  process.exitCode = 1;
} else {
  console.log(storyboardPath, "already uses scaleAspectFit");
}

const plistPath = "ios/App/App/Info.plist";
const locationUsage =
  "Where2P uses your location while the app is open to find public restrooms near you. Your position stays on this device and is sent only as the search point for nearby listings.";

let xml = readFileSync(plistPath, "utf8");

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setString(key, value) {
  const pattern = new RegExp("(<key>" + key + "</key>\\s*<string>)[\\s\\S]*?(</string>)");
  const safe = escapeXml(value);
  if (pattern.test(xml)) {
    xml = xml.replace(pattern, "$1" + safe + "$2");
    return;
  }
  xml = xml.replace(
    "</dict>\n</plist>",
    "\t<key>" + key + "</key>\n\t<string>" + safe + "</string>\n</dict>\n</plist>"
  );
}

function setBool(key, value) {
  const tag = value ? "<true/>" : "<false/>";
  const pattern = new RegExp("<key>" + key + "</key>\\s*<(?:true|false)/>");
  if (pattern.test(xml)) {
    xml = xml.replace(pattern, "<key>" + key + "</key>\n\t" + tag);
    return;
  }
  xml = xml.replace(
    "</dict>\n</plist>",
    "\t<key>" + key + "</key>\n\t" + tag + "\n</dict>\n</plist>"
  );
}

setString("CFBundleDisplayName", "Where2P");
setString("NSLocationWhenInUseUsageDescription", locationUsage);
// The geolocation plugin's iOS library references the Always key. The app only
// requests while-in-use permission, and it does not enable background location.
setString("NSLocationAlwaysAndWhenInUseUsageDescription", locationUsage);
setString("UIUserInterfaceStyle", "Light");
setBool("ITSAppUsesNonExemptEncryption", false);
setBool("UIViewControllerBasedStatusBarAppearance", true);

writeFileSync(plistPath, xml);
console.log("Updated", plistPath);
