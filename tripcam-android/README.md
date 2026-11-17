# TRIPCAM — one app for phone + Galaxy Watch

A single APK (`com.yaway.tripcam`) installed on both devices.
`LauncherActivity` picks the screen: `WatchActivity` on a watch, `PhoneActivity` on a phone.

- Open TRIPCAM on the watch → it sends `/tripcam-launch/start` → `LaunchService` on the phone
  opens `PhoneActivity` (camera + effects, WebGL page in `assets/tripcam/`), which streams
  JPEG frames to the watch over the Wear OS Data Layer.
- Watch tap / long-press / bezel → `/tripcam/ctl` → effect changes on the phone.
- Swipe TRIPCAM away on the watch → `/tripcam-launch/stop` → phone camera closes.
- Auto-open needs "Display over other apps" on the phone (asked once); otherwise a tap-to-start notification appears.

GitHub Actions builds the APK on every push to this branch → release `tripcam-latest`.
