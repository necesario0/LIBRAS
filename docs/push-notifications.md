# Push notifications: the owner's setup

LIBRAS sends push notifications through Expo's push service, which hands them to Firebase Cloud Messaging (FCM) for Android phones. The code is ready (ticket #54). Until the steps below are done, every APK works without push notifications: it never asks for the notification permission and never registers the phone, and the Settings switches still save.

Only the project owner can do these steps, because they need the owner's Google and Expo accounts. Do them once, in order. Each step says how to tell it worked.

Never commit `google-services.json` or the service account key file. `.gitignore` already ignores `google-services.json` and `*firebase-adminsdk*.json`.

## Checklist

1. **Expo project.** Sign in at https://expo.dev (create a free account if needed) and create a project with the slug `libras`, the `slug` in `apps/mobile/app.config.ts`. It worked if the project page shows a Project ID (a UUID).
2. **Project id for builds.** Add `EXPO_PROJECT_ID=<that UUID>` as a new line in `.env.hosted` at the repository root. It is an id, not a secret. `npm run build:apk:hosted` reads it from there.
3. **Firebase project.** At https://console.firebase.google.com, choose Add project (any name, for example "LIBRAS"). Google Analytics is not needed. It worked if the project overview opens.
4. **Android app in Firebase.** In that project, add an Android app with the package name `ph.edu.umak.libras` (it must match exactly). Skip the SDK steps the wizard shows, because Expo does them. Download `google-services.json` and save it as `apps/mobile/google-services.json`. It worked if `git status` does not list the file (it is ignored).
5. **FCM key for Expo.** In Firebase, open Project settings > Service accounts and choose Generate new private key. A JSON file downloads. Upload it to Expo: expo.dev > the `libras` project > Credentials > Android > `ph.edu.umak.libras` (add this application identifier if it is not listed) > FCM V1 service account key > Add a key > Upload. Then delete the downloaded JSON from your computer. Expo keeps it. It worked if the Credentials page lists the FCM V1 key.
6. **Optional, enhanced security.** If you turn on "Enhanced security for push notifications" in the Expo project settings, create an access token (expo.dev > Account settings > Access tokens) and set it as `EXPO_ACCESS_TOKEN` on Render (`libras-api` > Environment), then redeploy. Without enhanced security, skip this step.
7. **Build the APK.** Deploy the API first (see `docs/hosted-verification.md`, Tier 3 > Push notifications), then run `npm run build:apk:hosted -w @libras/mobile`. It worked if the build prints "Push notifications: on". "OFF" means step 2 or step 4 is missing.
8. **Phone.** Install the APK and sign in. Android asks "Allow LIBRAS to send you notifications?": choose Allow. It worked if the Supabase SQL editor shows the phone: `select member_id, registered_at from public.push_devices order by registered_at desc limit 5;`.
9. **A first push.** Copy the token from `select token from public.push_devices order by registered_at desc limit 1;`. Open https://expo.dev/notifications, paste the token, write a title and a body, set Data (JSON) to `{"kind":"holdReady"}` and send. It worked if the phone shows the notification with the LIBRAS icon, and tapping it opens My Books on Holds. If Expo answers with an FCM credentials error, repeat step 5.

The real checks with a ready Hold, an Announcement and the switches are part of the hosted verification (#55), in `docs/hosted-verification.md`.

## How it fits together

- The APK gets push notifications only when it is built with `apps/mobile/google-services.json` and `EXPO_PROJECT_ID` (`apps/mobile/app.config.ts`). `LIBRAS_PUSH=off` turns them off in any build. Emulator test builds have neither, so the Maestro flows never see the permission dialog.
- The phone registers its Expo push token with `PUT /members/me/push-device` on every start, and hands it back at sign-out. The API sends with `ExpoPushSender` (`apps/api/src/push/sender.ts`). The Firebase credentials live in the Expo project, never in the API.
- What is sent, when, and how duplicates and dead tokens are handled: `apps/api/README.md`, Push notifications.
