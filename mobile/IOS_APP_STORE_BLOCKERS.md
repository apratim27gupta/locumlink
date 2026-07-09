# iOS App Store — Blockers and Solutions

Last reviewed: 2026-07-02

Companion to `IOS_APP_STORE_CHECKLIST.md`. Lists only items that are **Missing**, **Partial**, or **Verify** — nothing already marked Done.

Each blocker includes a concrete solution. Items marked **Conditional** only apply if the stated condition is true for your submission path.

---

## How to use this doc

1. Resolve **P0 policy blockers** first (likely App Review rejection).
2. Resolve **P0 build blockers** (cannot upload without these).
3. Complete **P0 upload blockers** in App Store Connect.
4. Run **P0 QA verification** on a physical iPhone.
5. Tackle **P1 items** to reduce rejection risk before first submission.

---

## 1. Policy blockers (code / product)

### P0 — Likely rejection if skipped

#### Sign in with Apple
- **Status:** Missing
- **Type:** Conditional — required if Google/Microsoft OAuth stay visible in the iOS app
- **Blocker:** Guideline 4.8. Auth page shows Google and Microsoft buttons.
- **Solution (pick one):**
  - **Option A (recommended for parity):** Add Sign in with Apple via Supabase (`apple` provider). Configure Apple Developer Services ID, key, and redirect URL. Add Apple button to `frontend/src/app/auth/page.tsx`. Register callback in Supabase.
  - **Option B (minimal):** Detect iOS native shell (inject `window.__LOCUMLINK_NATIVE__` from `App.tsx`) and hide Google/Microsoft OAuth on iOS. Email OTP remains the only login method in the app.

#### Report user / message
- **Status:** Missing
- **Type:** Required
- **Blocker:** Guideline 1.2. In-app messaging exists; no user-facing report flow.
- **Solution:** Add "Report" action in `MessagesPage.tsx` (per conversation or message). POST to new backend endpoint (e.g. `POST /api/messages/report`). Store report + notify admin. Show confirmation to user.

#### Block user
- **Status:** Missing
- **Type:** Required
- **Blocker:** Guideline 1.2. No way for users to block abusive contacts.
- **Solution:** Add `blocked_users` table (blocker_id, blocked_id). Add block/unblock API. Hide blocked users from message list; reject new messages from blocked users. Add "Block user" in message thread menu.

#### Account deletion — iOS verification
- **Status:** Partial
- **Type:** Required
- **Blocker:** Deletion UI exists but must work inside iOS WebView. Wording must match backend behavior.
- **Solution:** On physical iPhone (Expo Go then production build): Settings → Delete account → confirm logout and data handling. Fix any API/cookie issues. Align modal copy with what `permanentDeleteAccount` actually does.

#### Privacy Policy URL — public access
- **Status:** Partial
- **Type:** Required
- **Blocker:** PDF exists at `/documents/privacy-policy.pdf` but must be a stable public URL for App Store Connect.
- **Solution:** Confirm `https://locumlink.ca/documents/privacy-policy.pdf` loads without login. Use that exact URL in App Store Connect. Add link in app footer or settings if not reachable when logged in.

#### No placeholder / incomplete app
- **Status:** Verify
- **Type:** Required
- **Blocker:** Guideline 4.2 / completeness. Reviewers reject beta or broken apps.
- **Solution:** Walk every core flow on iOS: sign up, profile setup, browse/post, apply, message, settings, logout, delete. Remove test copy and fix broken routes before submission.

#### Accurate feature set
- **Status:** Verify
- **Type:** Required
- **Blocker:** Store description must match in-app reality.
- **Solution:** Only list implemented features in App Store description. Do not mention native push or biometrics until shipped.

---

### P1 — High rejection risk

#### OAuth flow — real-device verification
- **Status:** Partial
- **Type:** Conditional — if social login stays enabled
- **Blocker:** `expo-web-browser` intercept exists but iOS cookie/session handoff is stricter than Android.
- **Solution:** Test Google and Microsoft login on physical iPhone. If session drops after callback, debug cookie persistence in WKWebView. Consider Universal Links for callback URL. Fallback: Option B under Sign in with Apple (hide social on iOS).

#### Native push notifications
- **Status:** Missing
- **Type:** Optional but strongly recommended
- **Blocker:** Guideline 4.2. App is a WebView wrapper; web push does not work in iOS WebView.
- **Solution:**
  1. Add `expo-notifications` to `mobile/`.
  2. Request permission on launch or after login.
  3. Send Expo push token to backend via WebView `postMessage` bridge.
  4. Add `expo_push_token` storage in DB; extend `PushService` to send via Expo Push API.
  5. Handle notification tap → deep link into WebView route.
  6. Test on EAS dev build (not Expo Go).

#### Face ID / Touch ID app lock
- **Status:** Missing
- **Type:** Optional but strongly recommended
- **Blocker:** Supports 4.2 differentiation alongside push.
- **Solution:** Add `expo-local-authentication`. On app foreground, prompt biometrics before showing WebView (skip if first launch or user disabled). Add `NSFaceIDUsageDescription` in `app.json`.

#### Published contact for concerns
- **Status:** Partial
- **Type:** Required
- **Blocker:** Support email exists; Apple also expects reachable support URL for UGC apps.
- **Solution:** Create public `https://locumlink.ca/support` page with email, hours, and how to report abuse. Link from app and App Store Connect.

#### Terms of Use — in-app access
- **Status:** Partial
- **Type:** Required
- **Blocker:** PDF on landing page; must be reachable from within the iOS app.
- **Solution:** Add Terms + Privacy links in settings or footer inside logged-in web UI. Open PDFs in WebView or Safari.

#### Permission usage descriptions
- **Status:** Missing
- **Type:** Conditional — when using Face ID, push, or photo picker
- **Blocker:** iOS crashes or rejects builds missing `infoPlist` strings.
- **Solution:** Add to `app.json` under `expo.ios.infoPlist`:
  - `NSFaceIDUsageDescription` — "Unlock Locum Link to protect your account"
  - `NSPhotoLibraryUsageDescription` — "Upload professional credentials and profile photos" (if uploads trigger picker)
  - Notification permission handled by system dialog; no plist string needed for push.

#### Google Analytics disclosure
- **Status:** Verify
- **Type:** Conditional
- **Blocker:** GA (`G-JLBQZSQFW3`) runs in web app loaded by WebView. Must declare in privacy labels.
- **Solution:** In App Store Connect privacy questionnaire, declare usage/analytics data collection. If not used for cross-app advertising tracking, ATT prompt likely not needed — confirm with current GA config.

#### In-app purchases (IAP)
- **Status:** Verify
- **Type:** Conditional
- **Blocker:** Only if selling digital goods in-app.
- **Solution:** Locum Link facilitates real-world staffing — external payment is fine. Confirm no premium digital features are sold in-app. If none, no IAP setup needed.

#### iOS Universal Links
- **Status:** Missing
- **Type:** Conditional — if OAuth or push deep links should open in-app
- **Blocker:** OAuth callback may land in Safari without Universal Links.
- **Solution:**
  1. Add `ios.associatedDomains: ["applinks:locumlink.ca"]` in `app.json`.
  2. Host `https://locumlink.ca/.well-known/apple-app-site-association` with app ID and paths (`/auth/callback`, notification routes).
  3. Enable Associated Domains capability in Apple Developer.
  4. Test on EAS build (not Expo Go).

#### Notification tap → in-app route
- **Status:** Missing
- **Type:** Conditional — if native push is added
- **Blocker:** Tapping notification must open relevant screen.
- **Solution:** Include `url` or `data.path` in push payload. In `expo-notifications` response listener, `webViewRef.injectJavaScript` or load `APP_ORIGIN + path`.

#### Expo push token registration
- **Status:** Missing
- **Type:** Conditional — if native push is added
- **Blocker:** Backend only supports web push (VAPID).
- **Solution:** Add `POST /api/notifications/push/register-expo` endpoint. Store token per user/device. Call from native shell after login via WebView bridge.

#### Medical / legal positioning
- **Status:** Verify
- **Type:** Conditional
- **Blocker:** Wrong category or claims can trigger extra scrutiny.
- **Solution:** Describe app as healthcare **staffing marketplace**. Avoid "diagnosis", "treatment", "patient care delivery" in metadata. Category: Business (or Medical only if accurate).

---

## 2. Build and configuration blockers

### P0 — Cannot publish without these

#### Apple Developer Program membership
- **Status:** Verify
- **Blocker:** No signing, TestFlight, or submission without active membership ($99/year).
- **Solution:** Enroll at developer.apple.com. Use organization account if publishing under company name.

#### Bundle ID registration
- **Status:** Partial
- **Blocker:** `ca.locumlink.app` declared in `app.json` but must exist in Apple Developer portal.
- **Solution:** Certificates, Identifiers & Profiles → Identifiers → register App ID `ca.locumlink.app`. Enable capabilities you need (Push, Associated Domains).

#### App Store Connect app record
- **Status:** Missing
- **Blocker:** Nowhere to upload build or submit for review.
- **Solution:** App Store Connect → Apps → New App. Select bundle ID, name, primary language, SKU.

#### iOS distribution certificate / provisioning
- **Status:** Missing
- **Blocker:** Cannot install production build without signing.
- **Solution:** Run `eas credentials` or let EAS manage automatically on first `eas build --platform ios`. Accept Apple agreements in App Store Connect.

#### `eas.json` production profile
- **Status:** Missing
- **Blocker:** No reproducible production iOS build.
- **Solution:** Create `mobile/eas.json`:
  ```json
  {
    "cli": { "version": ">= 12.0.0" },
    "build": {
      "development": {
        "developmentClient": true,
        "distribution": "internal",
        "ios": { "simulator": false }
      },
      "preview": {
        "distribution": "internal",
        "ios": { "simulator": false }
      },
      "production": {
        "ios": { "simulator": false }
      }
    },
    "submit": {
      "production": { "ios": {} }
    }
  }
  ```

#### `expo.ios.buildNumber`
- **Status:** Missing
- **Blocker:** App Store requires build number per upload.
- **Solution:** Add to `app.json`:
  ```json
  "ios": {
    "supportsTablet": true,
    "bundleIdentifier": "ca.locumlink.app",
    "buildNumber": "1"
  }
  ```
  Increment on every upload.

#### App icon and splash assets
- **Status:** Missing
- **Blocker:** Build fails or submits with broken branding. `mobile/assets/` does not exist.
- **Solution:** Create `mobile/assets/` with:
  - `icon.png` (1024×1024)
  - `splash.png`
  - `favicon.png` (web)
  Export from existing brand assets. Reuse `frontend/public/icon-512.png` as source if suitable.

#### `EXPO_PUBLIC_APP_URL` for production
- **Status:** Verify
- **Blocker:** Wrong URL in build points WebView at staging/dev.
- **Solution:** Set `EXPO_PUBLIC_APP_URL=https://locumlink.ca` in EAS production env or `eas.json` build profile. Confirm at build time.

---

### P1 — Build blockers when features are enabled

#### Push Notification capability
- **Status:** Missing
- **Type:** Conditional — if native push is added
- **Blocker:** APNs will not deliver without capability + key.
- **Solution:** Enable Push Notifications on App ID in Apple Developer. Create APNs key. Upload to EAS (`eas credentials`). Add `expo-notifications` plugin to `app.json`.

#### Expo plugins for native features
- **Status:** Partial
- **Blocker:** Only `expo-web-browser` configured; push/biometrics need plugins.
- **Solution:** Add to `app.json` plugins array as needed:
  - `expo-notifications`
  - `expo-local-authentication`

#### `ios.infoPlist` permission strings
- **Status:** Missing
- **Solution:** See Permission usage descriptions in Section 1.

#### `ios.associatedDomains`
- **Status:** Missing
- **Solution:** See iOS Universal Links in Section 1.

#### `ITSAppUsesNonExemptEncryption`
- **Status:** Missing
- **Blocker:** Export compliance; wrong answer can delay review.
- **Solution:** Add to `app.json`:
  ```json
  "ios": {
    "infoPlist": {
      "ITSAppUsesNonExemptEncryption": false
    }
  }
  ```
  Use `false` if app only uses standard HTTPS/TLS. Still complete questionnaire in App Store Connect at upload.

#### iPad / tablet support decision
- **Status:** Verify
- **Blocker:** `supportsTablet: true` requires iPad screenshots and layout QA.
- **Solution (pick one):**
  - **Option A:** Test on iPad, provide iPad screenshots.
  - **Option B (minimal):** Set `supportsTablet: false` in `app.json` for v1 to avoid iPad requirements.

---

## 3. Upload-time blockers (App Store Connect)

### P0 — Required before review

| Blocker | Status | Solution |
| --- | --- | --- |
| App name availability | Partial | Search App Store Connect. Confirm "Locum Link" is available or adjust. |
| Primary category | Missing | Select Business (recommended) or appropriate category. |
| Age rating questionnaire | Missing | Complete in App Store Connect. Answer honestly for staffing/messaging app. |
| Support URL | Missing | Publish `https://locumlink.ca/support`. Enter in App Store Connect. |
| App Privacy (Nutrition Labels) | Missing | Declare: name, email, professional info, credentials, messages, device ID (if push), usage data (GA). List third parties: Supabase, Google Cloud, Google Analytics. |
| Encryption questionnaire | Missing | At upload: "Does your app use encryption?" → Yes (HTTPS). Exempt → standard TLS only. |
| iPhone screenshots | Missing | Capture from TestFlight/production build on required device sizes (6.7", 6.5", 5.5" or use Xcode simulator templates). Real UI only. |
| Build upload + selection | Missing | `eas build --platform ios --profile production` then `eas submit` or select build in App Store Connect. |
| App Review contact | Missing | Add phone + email monitored during review week. |
| Demo credentials | Missing | Create dedicated host + locum test accounts with completed profiles and sample data. Provide in App Review Information. Use email OTP or document exact login steps. |

### P1 — Required or high friction

| Blocker | Status | Solution |
| --- | --- | --- |
| Copyright | Missing | e.g. `Copyright 2026 Locum Link` in App Store Connect. |
| App Review notes | Missing | Explain WebView app, test accounts, auth method, how to test messaging/deletion. See template in checklist doc. |
| Description | Missing | Write accurate feature list. Match what ships in v1. |
| iPad screenshots | Missing | Conditional if `supportsTablet: true`. Capture iPad screenshots or disable tablet support. |
| Paid Apps Agreement | Verify | App Store Connect → Agreements. Accept even for free apps. |
| App Tracking Transparency | Verify | Only if cross-app advertising tracking. Declare analytics in privacy labels regardless. |
| "What's New" / release notes | Missing | Write initial release notes for v1.0.0. |

---

## 4. QA verification blockers

Must pass on a **physical iPhone** using production or TestFlight build (Expo Go is not sufficient for final sign-off).

| Blocker | Status | Solution |
| --- | --- | --- |
| App launches without blank screen | Verify | Production build on iPhone. If blank: check `EXPO_PUBLIC_APP_URL`, network, SSL, CORS, and WebView errors. |
| Email OTP login | Verify | Full flow in iOS WebView. Fix cookie/storage if session lost. |
| OAuth login (if enabled) | Verify | Test Google + Microsoft on iPhone. Fix callback or hide on iOS. |
| Session persists after restart | Verify | Login → kill app → reopen. If logged out: fix WKWebView cookie persistence. |
| File / credential upload | Verify | Host profile upload on iPhone. Add photo library permission string if picker fails. |
| Messaging works | Verify | Send/receive between test accounts on iOS. |
| Account deletion works | Verify | Delete from Settings on iOS. Confirm API success and logout. |
| Push delivery (if added) | Verify | EAS dev build on iPhone. Send test via Expo Push Tool or backend. |
| Notification deep link (if added) | Verify | Tap notification → correct in-app screen. |
| No broken links | Verify | Test auth, settings, resources, privacy/terms PDFs in iOS app. |
| Keyboard / forms | Verify | Auth, messaging, profile forms with iOS keyboard open. |
| Error retry UI on device | Verify | Airplane mode or bad network → confirm retry overlay (code exists; confirm on device). |

---

## 5. Open decisions (resolve before building)

These block multiple items above. Decide first to avoid rework.

| Decision | Options | Unblocks |
| --- | --- | --- |
| Social login on iOS | Sign in with Apple **or** hide Google/Microsoft in iOS app | Sign in with Apple blocker, OAuth QA scope |
| Native differentiation | Add push + Face ID **or** accept 4.2 risk | Push, biometrics, permission strings, APNs setup |
| iPad support | Keep tablet **or** `supportsTablet: false` | iPad screenshots, layout QA |
| UGC scope | Full report/block **or** minimal report + admin | Messaging policy blockers |

---

## 6. Suggested resolution order

```
Week 1 — Policy code
  ├── Report + block user (messages)
  ├── Sign in with Apple OR hide social login on iOS
  └── Verify account deletion on iPhone

Week 2 — Native value (recommended)
  ├── expo-notifications + backend Expo tokens
  ├── Face ID app lock
  └── Universal Links + AASA file

Week 3 — Build + assets
  ├── mobile/assets/ (icon, splash)
  ├── eas.json + buildNumber + infoPlist
  ├── Apple Developer setup + EAS production build
  └── TestFlight install on iPhone

Week 4 — Upload + review
  ├── Support page + privacy label questionnaire
  ├── Screenshots + demo accounts + review notes
  ├── Full QA on TestFlight build
  └── Submit for App Review
```

---

## 7. Testing reference

| What | Where to test |
| --- | --- |
| WebView, OTP, basic OAuth | Expo Go on physical iPhone (early check only) |
| Session cookies, uploads, deletion | EAS preview/production build on iPhone |
| Native push, Face ID, Universal Links | EAS dev/preview build (not Expo Go) |
| Final sign-off | TestFlight production build |
