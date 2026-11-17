# TRIPCAM — phone + Galaxy Watch

Two Android apps with the same package (`com.yaway.tripcam`) and the same signing key
(`tripcam.keystore`), so they can talk over the Wear OS Data Layer (Bluetooth).

- `app/` — phone app. Camera + effects (WebGL page in `app/src/main/assets/tripcam/`),
  streams ~15 fps JPEG frames to the watch, receives watch controls.
- `wear/` — watch app. Shows the frames full screen. Tap = next effect,
  long-press = previous, bezel = intensity.

GitHub Actions builds both APKs on every push to this branch and attaches them to the
`tripcam-latest` release.
