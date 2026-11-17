# Ship Where2P on the App Store

The iOS app is a Capacitor 8 shell around this site. GitHub Pages still publishes the repository root on `master`. Nothing in `ios/` is required for the website. The site is copied into `www/` by `npm run build:web`, and `npx cap sync` copies `www/` into the Xcode project. Do not move `index.html` out of the root.

This was put together without a Mac. Xcode was not run, the app was not signed, and it was not uploaded. The website, the copy step, and the App Store screenshot sizes were checked in a browser. The permission dialog, status bar, splash screen, and safe-area layout still need a simulator or a phone.

## What you open

Capacitor 8 uses Swift Package Manager here, not CocoaPods. There is no `App.xcworkspace` and no `pod install`.

Open `ios/App/App.xcodeproj`. The scheme is **App**. The name on the home screen is **Where2P**.

| Setting | Value |
| --- | --- |
| Bundle id | `com.where2p.where2p` |
| Display name | Where2P |
| Deployment target | iOS 15.0 |
| Devices | iPhone only |
| Version | 1.0 (build 1) |
| Signing | Automatic, no team set |

## 1. Tools

- An Apple Developer Program membership.
- Xcode, current enough to archive an iOS 15 app. Open Xcode once and accept the license.
- Node.js 22 or newer, for the sync step below. The Pages site does not need Node.

## 2. Bundle id and display name

`com.where2p.where2p` is the App ID registered in the Apple Developer account and attached to the existing App Store Connect record named Where2P. These three have to match:

1. `appId` in `capacitor.config.js`
2. The App target in Xcode: **Signing & Capabilities**, Bundle Identifier
3. The App ID already registered at [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers/list)

`npx cap sync` does not rewrite the bundle id inside an existing Xcode project.

The display name is `appName` in `capacitor.config.js` and `CFBundleDisplayName` in `ios/App/App/Info.plist`. `npm run cap:sync` sets the plist name back to Where2P. The App Store name is separate and can be the same 30-character string, `Where2P`.

The project targets iPhone only (`TARGETED_DEVICE_FAMILY = 1` on the App target, Debug and Release). It still runs on iPad as an iPhone app. To ship a native iPad layout, set that build setting to `1,2` and add a 13-inch iPad screenshot in App Store Connect (2064 × 2752).

## 3. Sync the web app into Xcode

The files Xcode serves are generated and gitignored (`ios/App/App/public` and `ios/App/App/capacitor.config.json`). A fresh clone will not run until you sync.

```bash
npm install
npm run cap:sync
```

`cap:sync` copies the site, refreshes the Swift package list, and re-applies the location and export keys in `Info.plist`. After any change to HTML, CSS, or JS, run it again before you archive. The installed app does not load the GitHub Pages URL. A web change reaches phones only in a new build.

Open the project:

```bash
npm run cap:open
```

Or open `ios/App/App.xcodeproj` yourself. The first open resolves the local Swift packages under `node_modules`. If Xcode says a package is missing, run `npm install` from the repo root and reopen.

## 4. Signing

1. Select the **App** target.
2. Open **Signing & Capabilities**.
3. Check **Automatically manage signing**.
4. Choose your Team.

Xcode creates the provisioning profile on your Mac. Do not commit it. `.gitignore` already excludes `*.mobileprovision`, `*.p12`, `*.cer`, `*.certSigningRequest`, and `xcuserdata`.

If signing fails because the bundle id is already taken, pick a new id and update both places in section 2.

## 5. Run it

**Simulator.** Choose an iPhone simulator (a 6.7-inch model such as iPhone 16 Pro Max or whatever is current in your Xcode), then Product → Run. The launch screen is the teal Where2P card. Then:

- Allow location when iOS asks. The prompt is the system dialog, from Core Location, not the browser one. The usage string is in `Info.plist`.
- Deny it once, too. Search still works. Try `Austin, TX`.
- The map should pan and zoom, and tiles should load. Search chips should fill the list.
- Tap the Refuge Restrooms or OpenStreetMap link in the footer. It should open in the in-app browser (Safari View), not replace the app.
- Turn the simulator network off (Settings, or Features → Toggle Network Link Conditioner / the network condition in the simulator menu). A red offline bar should show, and Search should say you are offline instead of spinning.

**Phone.** Plug it in, trust the computer, and select the phone as the run destination. On iOS 16 and later the phone needs Developer Mode (Settings → Privacy & Security → Developer Mode). The same checks as the simulator apply. Location on a real device is the one that matters for the permission text.

The status bar uses white icons over the teal header, and the header padding uses `env(safe-area-inset-top)` so the logo sits below the notch and the Dynamic Island. The footer uses the bottom inset so it clears the home indicator. `ios.contentInset` is `never` on purpose. If you change it to `automatic`, the page will be padded twice.

## 6. Archive and upload

1. Set the run destination to **Any iOS Device (arm64)**.
2. Confirm the scheme is **App** and the configuration for Archive is Release (Product → Scheme → Edit Scheme → Archive).
3. Product → Archive.
4. Organizer → **Distribute App** → **App Store Connect** → Upload.

`ITSAppUsesNonExemptEncryption` is `false` because the app only uses the system HTTPS stack. If App Store Connect still asks about encryption, say it only uses standard HTTPS and qualifies for the exemption.

Each upload needs a new build number. In the App target, General, bump **Build** (`CURRENT_PROJECT_VERSION`). Leave **Version** (`MARKETING_VERSION`) at `1.0` until you want a new version string. Both Debug and Release have to stay in sync, or change the value in the project-level build settings so the two configurations share it.

## 7. App Store Connect listing

Create the app at [appstoreconnect.apple.com](https://appstoreconnect.apple.com) with the same bundle id. Suggested answers:

| Field | Value |
| --- | --- |
| Name | Where2P |
| Subtitle | Find public restrooms nearby |
| Primary category | Navigation |
| Secondary category | Travel |
| Content rights | You own or have licensed the rights (the wordmark is the one already in this repo) |
| Age rating | 4+, with the questionnaire below |
| Price | Free |
| Availability | The countries you want |
| Copyright | Use the line you and the other authors want. The README lists Jake Dudum, Darryl Tolentino, Hallie Calhoun, and Adrienne Liu. |
| Support URL | `https://halliecalhoun.github.io/where2p-app/` |
| Marketing URL | `https://halliecalhoun.github.io/where2p-app/` |
| Privacy Policy URL | `https://halliecalhoun.github.io/where2p-app/privacy.html` |
| SKU | `where2p` |

Merge this branch and wait until GitHub Pages is serving `privacy.html` before you submit. Connect checks that the privacy URL loads.

Promotional text (170 characters, you can change it without a new binary):

```
Find a public restroom nearby. Search a city or use your location, see places on a map, and read or leave a review.
```

Description:

```
Where2P helps you find a public restroom while you are out.

Search for a city or address, or use your current location. Nearby listings show up in a list and on a map, with distance and details such as accessible, all-gender, and changing table when the listing includes them.

Read reviews from other people, or leave your own. No account is required.

Listings come from Refuge Restrooms. The map is OpenStreetMap. Names and notes are community-submitted, so they vary.

You can search without sharing your location. If you do share it, Where2P uses it only to look up restrooms near you, and only while the app is open.
```

Keywords (100 characters, comma-separated, no space after the commas):

```
restroom,bathroom,toilet,public,accessible,unisex,map,nearby,changing table,all-gender
```

### Screenshots

This project targets iPhone, so Connect asks for the 6.7-inch and 6.5-inch sizes:

| Display | Portrait pixels | File |
| --- | --- | --- |
| 6.7-inch | 1290 × 2796 | `docs/app-store-screenshots/iphone-6.7-search.png` |
| 6.5-inch | 1284 × 2778 | `docs/app-store-screenshots/iphone-6.5-search.png` |

Those two files are captures of this site running at those exact pixel sizes. They do not include the iOS status bar, because they were not taken in the simulator. You can upload them to get the record started, and replace them with simulator screenshots (File → New Screen Shot, or Device → Trigger Screenshot in the Simulator) once you have run the app. Simulator shots are the better ones to ship.

App previews are optional. Skip them.

### Age rating questionnaire

Answer **None** for violence, sexual content, profanity, substances, horror, gambling, contests, and unrestricted web access. External links open Refuge Restrooms, OpenStreetMap, and the occasional directions URL. That is not a general browser.

Answer **Yes** to user-generated content. Reviews are public text with a display name. There is no account, no filter, no report button, and no block list.

That is a real rejection risk under [guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content). Apple expects a way to filter objectionable reviews, a way to report them, a way to block someone, and a published contact. This app does not have those. If you would rather not argue that point, hide the review buttons in the iOS build before you submit. The contact on the privacy page is the GitHub issues list.

### Review notes

Paste this into App Review Information. There is no demo account.

```
Where2P finds public restrooms. No account.

Location: iOS asks on launch so the app can search near you. Denying permission is fine. Search for Austin, TX instead. Location is when-in-use only. It is sent to the Refuge Restrooms API as the search point and is not stored by us.

The map is Leaflet on OpenStreetMap. Search uses the Photon geocoder. Reviews, if you leave one, save a name, rating, and text to Firebase.

Footer links open in Safari View. Airplane mode shows an offline message. Search, the map, and reviews need a connection.
```

Add a phone number Connect can use. That field is required and it is yours, not something this repo can fill in.

## 8. Privacy nutrition label

Answer from what the app actually does. **Data Used to Track You: none.** **Data Linked to You: none.** There is no account, no IDFA, and no analytics SDK. The name on a review is not tied to an Apple ID or a device id by this app.

Under **Data Not Linked to You**, declare:

| Data type | Purpose | Why |
| --- | --- | --- |
| Precise Location | App Functionality | "Use my location" and the launch lookup. Coordinates go to the Refuge Restrooms API. Not stored by Where2P. |
| Coarse Location | App Functionality | The person can choose Approximate Location on the iOS prompt. Same use as precise. |
| Search History | App Functionality | The city or address is sent to Photon (photon.komoot.io) to geocode. The last query also sits in session storage on the device. |
| Name | App Functionality | The name someone types on a review. Stored in Firebase Realtime Database (`where2p-e3170`, us-central1) and shown with the review. |
| Other User Content | App Functionality | The rating and review text, same Firebase path. |

Do not declare email, phone, photos, health, financial info, contacts, browsing history, purchases, or diagnostics. Do not turn on tracking.

The app does not receive a device identifier. Loading Leaflet, Firebase, the font, and map tiles does send an IP address to cdnjs, Google, and the OpenStreetMap tile servers as part of fetching those files. That is disclosed on `privacy.html`. It is not a data type you collect into your own database.

`ios/App/App/PrivacyInfo.xcprivacy` records the same types for the privacy manifest, with tracking off. Capacitor's own manifest is pulled in by the Swift package.

## 9. Guideline 4.2

Apple rejects apps that are just a website in a web view. This project is still HTML inside WKWebView, so that risk is not gone. What is native:

- Core Location through `@capacitor/geolocation`, with `NSLocationWhenInUseUsageDescription`. The plugin also asks for `NSLocationAlwaysAndWhenInUseUsageDescription` because of the library it uses. The app never requests Always, and `Info.plist` has no location background mode. The prompt the person sees is while-in-use.
- A launch screen and a 1024 icon built from the teal header and the Where 2P wordmark (`assets/icon-only.png`, `assets/splash.png`). Regenerate with `npx @capacitor/assets generate --ios` after you change those sources.
- Status bar overlay with white icons, and safe-area padding so the UI misses the notch and the home indicator.
- `@capacitor/network` plus an offline bar. Search, location lookup, the directory, and reviews fail with a clear message when there is no connection.
- `http` and `https` links to other sites open in the in-app browser instead of navigating the web view away from the app.
- The web view is pinned to a mobile layout so the map and the search field behave like the phone site. Map tiles, Photon, Refuge Restrooms, and Firebase are loaded as subresources. `limitsNavigationsToAppBoundDomains` is left off so those hosts are not blocked.

If review rejects 4.2 anyway, more CSS will not fix it. The next step is a native screen (a SwiftUI list, for example) rather than another wrapper pass.

## 10. After the site changes

```bash
npm run cap:sync
```

Then archive again with a higher build number.

The Pages site does not use this command. Pushing `master` is still how the website updates.

## Known limits

- Public OpenStreetMap tiles are what the site already uses. The tile servers are not meant for a large production app. Fine for a first build. If traffic grows, point Leaflet at a tile host that allows it.
- Review access is `database.rules.json` on the `where2p-e3170` Realtime Database (us-central1). Publishing those rules is a Firebase console or CLI step, not an Xcode one. See the README. The database is empty until the rules are published and someone leaves a review.
- `NSLocationAlwaysAndWhenInUseUsageDescription` is present because `@capacitor/geolocation` 8 says the underlying iOS library requires the key. Do not add the location background mode.
