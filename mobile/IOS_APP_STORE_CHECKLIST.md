# iOS App Store Submission Checklist

Last reviewed: 2026-07-02

Scope: iOS-only App Store submission for the Expo mobile app in `mobile/`.

---

## How to read this doc

### Requirement type

| Type | Meaning |
| --- | --- |
| **Required** | Must be done before submission. Apple will reject or block upload without it. |
| **Conditional** | Required only if a specific condition applies to your app. See the condition in Notes. |
| **Optional** | Not required for approval, but recommended for lower risk or better UX. |

### Status

| Status | Meaning |
| --- | --- |
| **Done** | Already present in codebase/config. |
| **Partial** | Foundation exists; more work or verification needed. |
| **Missing** | Not present yet. |
| **Verify** | Externally owned or needs confirmation on a real device/build. |

### Priority (within each section)

| Priority | Meaning |
| --- | --- |
| **P0** | Blocker — do before first upload or review. |
| **P1** | High risk — likely rejection or major friction if skipped. |
| **P2** | Recommended before first submission. |
| **P3** | Polish — can follow after v1 if needed. |

---

## Summary

The current iOS app is a thin Expo shell that loads `https://locumlink.ca` in a WebView. Loading/error states and OAuth handling exist, but policy compliance features and production build configuration are incomplete.

**Do in this order:**
1. Build policy-compliance features (Section 1).
2. Prepare production bundle configuration (Section 2).
3. Complete App Store Connect upload-time items (Section 3).
4. Run pre-submission QA (Section 4).

---

## Section 1 — Policy compliance features

Code/product changes needed to satisfy Apple guidelines. These are **not** solved by metadata alone.

### 1.1 Authentication (Guideline 4.8)

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Sign in with Apple | **Conditional** | P0 | Missing | **Required if** Google/Microsoft OAuth remain visible in the iOS app. Pick one: add Apple auth, or hide social login in the iOS shell and offer email OTP only. |
| Email OTP login | **Required** | P0 | Done | Already implemented. Must work reliably inside iOS WebView. |
| OAuth flow in native shell | **Conditional** | P1 | Partial | **Required if** social login stays enabled. `expo-web-browser` intercept exists; verify on real iPhone. |

### 1.2 Account management (Guideline 5.1.1)

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Account deletion from within app | **Required** | P0 | Partial | Settings UI exists (`permanentDeleteAccount`). Verify end-to-end inside iOS WebView and that copy matches backend behavior. |
| Account deactivation | **Optional** | P2 | Done | Temporary deactivate exists. Not a substitute for deletion, but good UX. |

### 1.3 User-generated content (Guideline 1.2)

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Report user/message | **Required** | P0 | Missing | Messaging exists between hosts and locums. Apple expects a user-facing report mechanism. |
| Block user | **Required** | P0 | Missing | Needed alongside reporting for messaging apps. |
| Admin moderation backend | **Optional** | P2 | Partial | Admin flagging exists server-side. Helpful but does not replace in-app report/block. |
| Published contact for concerns | **Required** | P1 | Partial | Support email exists (`support@locumlink.ca`). Must also be reachable via public support URL (Section 3). |

### 1.4 Minimum functionality / WebView (Guideline 4.2)

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Native push notifications | **Optional** | P1 | Missing | Not strictly required by a written rule, but strongly recommended to differentiate from Safari/PWA and reduce 4.2 rejection risk. Web push does not work reliably in iOS WebView. |
| Face ID / Touch ID app lock | **Optional** | P1 | Missing | Not required, but smallest native addition alongside push. Adds security value Apple reviewers recognize. |
| WebView loading/error states | **Required** | P1 | Done | Spinner, error overlay, and retry exist in `App.tsx`. |
| WebView crash recovery | **Required** | P2 | Done | `onContentProcessDidTerminate` reloads WebView. |

### 1.5 Privacy-related product behavior

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Privacy Policy accessible without login | **Required** | P0 | Partial | PDF linked from landing page (`/documents/privacy-policy.pdf`). Confirm stable public URL for App Store Connect. |
| Terms of Use accessible | **Required** | P1 | Partial | PDF linked from landing page. Confirm accessible from within iOS app. |
| Permission usage descriptions in app | **Conditional** | P1 | Missing | **Required when** you add Face ID, native push, or iOS triggers photo/camera picker for credential uploads. Add `infoPlist` strings in `app.json`. |
| Google Analytics disclosure | **Conditional** | P1 | Verify | **Required to declare** in privacy labels if GA remains enabled (`G-JLBQZSQFW3`). Determine if ATT prompt is needed. |
| In-app purchases (Apple IAP) | **Conditional** | P1 | Verify | **Not required if** you only facilitate real-world staffing services with external payment. **Required** if you sell digital subscriptions or premium in-app features. |

### 1.6 Deep linking and notifications (product)

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| iOS Universal Links | **Conditional** | P1 | Missing | **Required if** you want OAuth callbacks and notification taps to open in-app instead of Safari. Needs `associatedDomains` + `apple-app-site-association` on `locumlink.ca`. |
| Notification tap → in-app route | **Conditional** | P1 | Missing | **Required if** native push is added. Deep link into WebView (`/locum/messages`, etc.). |
| Expo push token registration | **Conditional** | P1 | Missing | **Required if** native push is added. Backend currently supports web push only. |

### 1.7 Content and legal positioning

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| No placeholder/beta content | **Required** | P0 | Verify | App must be complete. No lorem ipsum, test labels, or broken core flows. |
| Accurate feature set | **Required** | P0 | Verify | Store listing and in-app experience must match. |
| Medical disclaimer in positioning | **Conditional** | P2 | Verify | **Recommended if** category/metadata could imply clinical care. Frame as staffing marketplace, not diagnosis/treatment. |

---

## Section 2 — Production bundle configuration

Technical and Expo/Apple setup handled when building the production iOS binary. Most of these are **not** App Review policy features — they are build, signing, and runtime config.

### 2.1 Apple Developer and signing

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Apple Developer Program membership | **Required** | P0 | Verify | Active membership needed for identifiers, signing, TestFlight, submission. |
| Bundle ID `ca.locumlink.app` | **Required** | P0 | Partial | Declared in `app.json`. Must be registered in Apple Developer portal. |
| App Store Connect app record | **Required** | P0 | Missing | Create before first upload. |
| iOS distribution certificate / provisioning | **Required** | P0 | Missing | EAS can manage automatically once configured. |
| Push Notification capability | **Conditional** | P1 | Missing | **Required if** adding native push. Enable in Apple Developer + Expo config. |

### 2.2 Expo / EAS build config

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| `eas.json` with iOS production profile | **Required** | P0 | Missing | No `eas.json` found. Needed for reproducible production builds. |
| `expo.ios.buildNumber` | **Required** | P0 | Missing | Must increment for each App Store upload. |
| `EXPO_PUBLIC_APP_URL` for production | **Required** | P0 | Verify | Defaults to `https://locumlink.ca`. Confirm production URL at build time. |
| EAS project ID | **Required** | P0 | Done | Present in `app.json` (`extra.eas.projectId`). |
| Expo plugins for native features | **Conditional** | P1 | Partial | `expo-web-browser` exists. Add `expo-notifications`, `expo-local-authentication` if implementing those features. |
| `ios.infoPlist` permission strings | **Conditional** | P1 | Missing | **Required when** using Face ID, push, photo library, etc. |
| `ios.associatedDomains` | **Conditional** | P1 | Missing | **Required when** implementing Universal Links. |
| `ITSAppUsesNonExemptEncryption` | **Required** | P1 | Missing | Set in `app.json` if using only standard HTTPS/TLS (likely exempt). Also complete questionnaire at upload (Section 3). |

### 2.3 App assets (bundled in binary)

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| App icon (`./assets/icon.png`) | **Required** | P0 | Missing | Referenced in `app.json` but `mobile/assets/` directory does not exist. |
| Splash screen (`./assets/splash.png`) | **Required** | P0 | Missing | Referenced in `app.json`. |
| iOS tablet support decision | **Conditional** | P1 | Verify | `supportsTablet: true` is set. **If kept:** test iPad layout. **If not ready:** set `supportsTablet: false` to avoid iPad screenshot requirement. |

### 2.4 WebView runtime config (already in code)

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| WebView loads production origin | **Required** | P0 | Done | `APP_ORIGIN` → `https://locumlink.ca`. |
| JavaScript / DOM storage enabled | **Required** | P0 | Done | Required for web app to function. |
| OAuth URL interception | **Conditional** | P1 | Done | Google/Microsoft/Supabase URLs handled via `expo-web-browser`. |
| Safe area handling | **Required** | P2 | Done | `SafeAreaProvider` + `SafeAreaView`. |
| Custom URL scheme `calocumlinkapp` | **Optional** | P2 | Done | Declared in `app.json`. Universal Links are preferred for HTTPS callbacks. |

---

## Section 3 — Upload-time guidelines (App Store Connect)

Items completed in App Store Connect at or after uploading the production build. No code changes, but **required before review**.

### 3.1 Required for every submission

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| App name | **Required** | P0 | Partial | `Locum Link` in `app.json`. Confirm name availability in App Store Connect. |
| Primary category | **Required** | P0 | Missing | Likely Business; confirm with product positioning. |
| Age rating questionnaire | **Required** | P0 | Missing | Complete honestly. Staffing marketplace ≠ medical advice app. |
| Privacy Policy URL | **Required** | P0 | Partial | Must be a public, stable URL. |
| Support URL | **Required** | P0 | Missing | Public page required (not just `mailto:`). |
| Copyright | **Required** | P1 | Missing | e.g. `Copyright 2026 Locum Link`. |
| App Privacy details (Nutrition Labels) | **Required** | P0 | Missing | Declare: account info, professional data, credentials, messages, device tokens (if push added), analytics, third parties (Supabase, GCS, GA). |
| Encryption export compliance questionnaire | **Required** | P0 | Missing | Answer during upload. Standard HTTPS usually qualifies for exemption. |
| iPhone screenshots | **Required** | P0 | Missing | Real UI only. Capture from production build or TestFlight. |
| Build selection | **Required** | P0 | Missing | Upload via EAS Submit or Transporter, then select build in App Store Connect. |
| App Review contact info | **Required** | P0 | Missing | Phone/email monitored during review. |
| Demo credentials for reviewers | **Required** | P0 | Missing | Provide locum + host accounts with completed profiles. Login must work in iOS app. |
| App Review notes | **Required** | P1 | Missing | Explain: test accounts, role flows, WebView behavior, how to test auth/notifications/deletion. |
| Description | **Required** | P1 | Missing | Must match actual features. No unimplemented claims. |

### 3.2 Conditional at upload time

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| iPad screenshots | **Conditional** | P1 | Missing | **Required if** `supportsTablet: true` and app is available on iPad. |
| Subtitle | **Conditional** | P2 | Missing | Optional in some regions but recommended. |
| Keywords | **Conditional** | P2 | Missing | Affects discoverability, not approval. |
| Promotional text | **Optional** | P3 | Missing | Can be updated without new build. |
| "What's New" release notes | **Required** | P1 | Missing | Required for each version after v1. For v1, initial release notes suffice. |
| Paid Apps Agreement / banking | **Conditional** | P1 | Verify | **Required if** selling paid app or IAP. Free app still needs agreements accepted in App Store Connect. |
| App Tracking Transparency (ATT) | **Conditional** | P1 | Verify | **Required if** tracking users across apps/websites for advertising. Declare accurately in privacy labels regardless. |

### 3.3 Optional upload-time polish

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Marketing URL | **Optional** | P3 | Missing | Points to marketing site. Not required. |
| Preview video | **Optional** | P3 | Missing | Not required for approval. |
| Phased release | **Optional** | P3 | Missing | Roll out gradually after approval. |
| TestFlight external testing | **Optional** | P2 | Missing | Recommended before App Review, not required. |

---

## Section 4 — Pre-submission QA

Verify on a **production build on a physical iPhone** before submitting for review.

| Item | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| App launches without blank screen | **Required** | P0 | Verify | |
| Email OTP login works | **Required** | P0 | Verify | |
| OAuth login works (if enabled) | **Conditional** | P0 | Verify | **Required if** Google/Microsoft buttons remain in iOS app. |
| Session persists after app restart | **Required** | P1 | Verify | |
| Profile/credential file upload works | **Required** | P1 | Verify | Test photo/PDF picker in WebView. |
| Messaging send/receive works | **Required** | P1 | Verify | |
| Account deletion works | **Required** | P0 | Verify | |
| Push notification delivery (if added) | **Conditional** | P1 | Verify | |
| Notification tap opens correct screen (if added) | **Conditional** | P1 | Verify | |
| No broken links in core flows | **Required** | P1 | Verify | Auth, settings, resources, privacy/terms PDFs. |
| Keyboard does not break forms | **Required** | P2 | Verify | Auth, messaging, profile setup. |
| Offline / server error shows retry UI | **Required** | P2 | Done | Error overlay exists; verify on device. |
| Accessibility: pinch zoom | **Optional** | P2 | Verify | Web viewport sets `maximumScale: 1`. Consider allowing zoom. |
| VoiceOver spot check | **Optional** | P3 | Verify | Not always a rejection reason, but good practice. |

---

## What we already have

| Area | Status |
| --- | --- |
| Expo mobile app (SDK 54) | Done |
| WebView shell loading `locumlink.ca` | Done |
| Loading spinner | Done |
| Error overlay + retry | Done |
| OAuth browser session handling | Done |
| Email OTP auth | Done |
| Google + Microsoft OAuth (web) | Done |
| Account delete/deactivate UI | Done |
| Web push infrastructure (backend) | Done |
| Privacy/Terms PDFs on landing page | Partial |
| Bundle ID declared | Partial |
| EAS project ID | Done |

---

## Open decisions

| Decision | Options | Affects |
| --- | --- | --- |
| Social login on iOS | Add Sign in with Apple **or** hide Google/Microsoft in iOS app | Section 1.1 (P0) |
| Native differentiation | Add push + Face ID **or** accept higher 4.2 risk | Section 1.4 |
| iPad support | Keep `supportsTablet: true` **or** disable for v1 | Sections 2.3, 3.2 |
| UGC moderation scope | Full report/block UX **or** minimal report + admin backend | Section 1.3 |
| Notification prefs | Keep localStorage **or** sync to server when native push added | Section 1.6 |

---

## Suggested App Review notes (template)

Use after policy features and production build are ready:

> Locum Link is a healthcare staffing platform connecting clinics (hosts) and locum providers. The iOS app is a native companion providing [push notifications / biometric app lock — fill in what was implemented].
>
> **Demo accounts:**
> - Host: [email] / [instructions]
> - Locum: [email] / [instructions]
>
> **To test:** Sign in → complete profile → browse/post opportunities → send a message → check notifications → Settings → account deletion.
>
> OAuth (Google/Microsoft) opens in system browser and returns to the app. Email OTP login is also available.
