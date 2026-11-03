# Packaging and distribution

Waypoint targets macOS 13+ and Windows 10/11. The current artifacts are local/test
builds, without a Developer ID notarization ticket or Windows publisher signature.

## macOS app and DMG

```bash
pnpm install --frozen-lockfile
./scripts/package-macos.sh
```

The script builds the release `.app`, seals the whole bundle with an ad hoc hardened-runtime
signature when no Developer ID identity is configured, verifies it, and stages it
beside an Applications symlink. It then
creates a compressed DMG with `hdiutil` and verifies its checksum. Outputs are in
`src-tauri/target/release/bundle/{macos,dmg}`. The host architecture is used; this
run produces Apple Silicon/aarch64 artifacts, not an Intel or universal build.
Building other architectures requires their Rust targets and separate validation.

The ordinary `pnpm tauri build --bundles app,dmg` route also exists. Its styled DMG
step uses Finder automation and timed out on this machine. The repository script
uses a plain disk-image layout and needs no Finder automation. `hdiutil` is retained
for compatibility with the minimum macOS version; newer macOS may print deprecation
messages while creating and successfully verifying the image.

## Developer ID, hardened runtime, and notarization

Install your Developer ID Application certificate/private key in your own Keychain.
Set `APPLE_SIGNING_IDENTITY` to that installed identity when building. Tauri's
`bundle.macOS.hardenedRuntime` defaults to true in the pinned config implementation;
keep it enabled for distribution. No certificate, password, API key, or entitlement
file has been added to this repository. Review required entitlements against the
actual release behavior instead of broadly disabling runtime protections.
[Tauri's signing guide](https://v2.tauri.app/distribute/sign/macos/) documents the
identity and Apple ID / App Store Connect environment variables for automatic
notarization and stapling during a Tauri build.

For a manually notarized DMG, use an existing notarytool Keychain profile after
building and signing the app. Sign the finished image with the same Developer ID
identity, then submit, staple, and validate:

```bash
codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$WAYPOINT_DMG"
xcrun notarytool submit "$WAYPOINT_DMG" --keychain-profile waypoint-notary --wait
xcrun stapler staple "$WAYPOINT_DMG"
xcrun stapler validate "$WAYPOINT_DMG"
codesign --verify --deep --strict "$WAYPOINT_APP"
spctl --assess --type open --context context:primary-signature --verbose "$WAYPOINT_DMG"
```

`WAYPOINT_APP` and `WAYPOINT_DMG` refer to your generated artifacts; the Keychain
profile must already exist and contain your authorized credentials. These signing
steps were documented, not executed. `--deep` is used for verification only; Tauri
handles signing nested app components. See Apple's
[notarytool workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

The legacy `macOSPrivateApi` setting remains true in this project, but it is a
**no-op in pinned Tauri 2.12.4**: those webview APIs are always enabled in 2.12.1+.
The pinned Wry source still uses private `drawsBackground` / `fullScreenEnabled`
KVC keys for this implementation. Treat this as a direct-distribution build,
unsuitable for Mac App Store submission. Turning the flag off does not remove
those calls. A Store build would require a public-API implementation and review.
[Tauri configuration](https://v2.tauri.app/reference/config/#macosprivateapi),
[Apple guideline 2.5.1](https://developer.apple.com/app-store/review/guidelines/#software-requirements).

## Windows installer

Build on Windows with Visual Studio C++ Build Tools, the Windows SDK, WebView2,
Node, pnpm, and Rust installed:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-features -- -D warnings
pnpm tauri build --bundles nsis
```

The NSIS executable is written to `src-tauri/target/release/bundle/nsis`. WebView2
installation follows Tauri's default download-bootstrapper mode, so a machine
without WebView2 needs network access during installation. The app itself bundles
its frontend and fonts and needs no runtime network. An offline installation would
require explicitly bundling the runtime and accepting the larger installer.
[Tauri's Windows installer guide](https://v2.tauri.app/distribute/windows-installer/).

`.github/workflows/windows.yml` runs tests, lint, and a release installer build on
Windows Server 2022. Actions use pinned commit SHAs, Node/pnpm/Rust use pinned
versions, the workflow token has read-only contents access, and no release is
published. The `waypoint-windows-x64` artifact is retained for 14 days. Building in
CI verifies compilation and packaging; it does not verify PowerPoint focus,
click-through, topmost behavior, or the interactive EyeDropper API. Those checks
require a Windows desktop and remain in the M5 acceptance checklist.
