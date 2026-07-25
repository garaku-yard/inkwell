# Releasing Inkwell

How to cut a new desktop release. The GitHub Actions workflow in
`.github/workflows/release.yml` does the actual building — your job is just
to bump the version and push a tag.

## Before your first release

- Nothing to configure. GitHub Actions is free for public repos, and the
  default `GITHUB_TOKEN` has everything the workflow needs to create a
  release and upload artefacts.

## Cutting a release

1. **Bump the version.** Edit `client/src-tauri/tauri.conf.json` and change
   the `"version"` field. Semver: bump patch for fixes, minor for features,
   major for breaking changes.

2. **Commit and tag.** The tag name must start with `v` (e.g. `v0.1.0`) —
   that's what the release workflow watches for.

   ```sh
   git commit -am "chore: release v0.1.0"
   git tag v0.1.0
   git push origin main --tags
   ```

3. **Watch the workflow.** GitHub → Actions → "Release". It runs two jobs
   in parallel:
   - `Build Linux` on `ubuntu-22.04` (~8–12 min)
   - `Build Windows` on `windows-latest` (~8–15 min)

   Total wall time usually 15 min. If either fails, see
   [Troubleshooting](#troubleshooting) below.

4. **Publish the draft.** GitHub → Releases → find the newly created draft
   named after the tag. Assets attached:

   | Platform | File |
   | --- | --- |
   | Windows | `Inkwell_X.Y.Z_x64-setup.exe` |
   | Linux | `Inkwell_X.Y.Z_amd64.AppImage` |
   | Linux | `Inkwell_X.Y.Z_amd64.deb` |

   Edit the release notes (they're pre-filled with install instructions),
   then click **Publish release**.

## What users will see

- **Windows:** SmartScreen warns the app is "unrecognized." Click "More
  info" → "Run anyway." This goes away once we add Windows code signing
  (deferred — see CLAUDE.md).
- **Linux AppImage:** `chmod +x Inkwell_*.AppImage && ./Inkwell_*.AppImage`.
- **Linux `.deb`:** `sudo apt install ./Inkwell_*.deb`. Pulls
  `libwebkit2gtk-4.1-0` + `libgtk-3-0` automatically.

All three create a local SQLite DB on first launch:

- Linux: `~/.config/com.inkwell.app/inkwell.db`
- Windows: `%APPDATA%\com.inkwell.app\inkwell.db`

## Troubleshooting

**The workflow didn't start.**
Check that the tag begins with `v`. Tags without the `v` prefix are ignored
by the trigger. Re-tag: `git tag -d v0.1.0 && git tag v0.1.0 && git push
origin v0.1.0 --force`.

**Linux build fails on a webkit package.**
`ubuntu-22.04` is pinned in the workflow because Tauri v2 supports
`libwebkit2gtk-4.1-dev` cleanly there. If you see apt errors after a future
runner image update, check Tauri's v2 prerequisites page for the current
package list and update `release.yml`.

**Windows build hangs on NSIS.**
The NSIS installer plugin downloads on first run. If a CI run fails
partway, the Rust cache may contain corrupt state; bump the cache key by
adding a comment to `release.yml` to force a fresh restore.

**Release draft didn't get any assets.**
Check the Actions log for the failing step — usually a Rust compile error
in release mode (different profile than `cargo build`). Fix locally with
`cd client/src-tauri && cargo build --release`.

**Want to retry without bumping the version.**
Delete the tag locally and remotely, then recreate:

```sh
git tag -d v0.1.0
git push origin --delete v0.1.0
# make fixes, commit
git tag v0.1.0 && git push origin v0.1.0
```

GitHub Actions will also delete the incomplete draft release when the new
run finishes.

## Enabling auto-updates (later)

Deferred until v0 ships. When you're ready:

1. Generate a signing key pair:

   ```sh
   npx tauri signer generate -w ~/.tauri/inkwell.key
   ```

   Prompts for a password. Keep both files safe — losing them means users
   can't receive any future updates.

2. Add repo secrets in GitHub → Settings → Secrets and variables →
   Actions:
   - `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/inkwell.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you chose

3. Add the `updater` plugin to `src-tauri/Cargo.toml`:

   ```toml
   tauri-plugin-updater = "2"
   ```

4. Register it in `src-tauri/src/lib.rs` alongside the SQL plugin.

5. Add to `tauri.conf.json`:

   ```json
   "plugins": {
     "updater": {
       "active": true,
       "endpoints": [
         "https://github.com/YOUR_ORG/inkwell/releases/latest/download/latest.json"
       ],
       "dialog": true,
       "pubkey": "PASTE_PUBLIC_KEY_FROM_inkwell.key.pub"
     }
   }
   ```

6. Install the JS plugin: `npm install @tauri-apps/plugin-updater` in
   `client/`, then check for updates from the app shell on boot.

The existing release workflow already picks up the secrets and signs
builds automatically — no changes to `release.yml` needed.

## Enabling Windows code signing (later)

Until you buy an OV cert (~$100–$400/yr) or EV cert (~$200–$600/yr),
Windows will warn about the unsigned installer. To enable signing:

1. Buy a cert from a CA (SSL.com, DigiCert, Sectigo).
2. Export the `.pfx` file with its password.
3. Add repo secrets:
   - `WINDOWS_CERT_BASE64` — `base64 < cert.pfx`
   - `WINDOWS_CERT_PASSWORD` — the cert password
4. Add a signing step to `release.yml` before the Tauri build. Tauri
   documents the exact format; it's ~10 lines of YAML.

## Arch Linux (AUR)

Inkwell ships to Arch as a binary AUR package (`inkwell-bin`) that wraps
the AppImage. That's the standard flow for Tauri apps — it avoids a full
Rust toolchain requirement on the end user's machine and stays in sync
with upstream automatically.

The PKGBUILD lives at [`packaging/arch/PKGBUILD`](packaging/arch/PKGBUILD).

### First-time AUR setup (once per repo)

1. Create an [AUR account](https://aur.archlinux.org/register) if you
   don't have one, and register your public SSH key.
2. Clone a fresh AUR repo for the package name:

   ```sh
   git clone ssh://aur@aur.archlinux.org/inkwell-bin.git
   ```

3. Copy the PKGBUILD in:

   ```sh
   cp packaging/arch/PKGBUILD inkwell-bin/
   cd inkwell-bin
   ```

4. Build locally to verify:

   ```sh
   updpkgsums                          # fills in real sha256 for the AppImage
   makepkg -si                         # builds + installs
   makepkg --printsrcinfo > .SRCINFO   # required by AUR
   ```

5. Commit and push:

   ```sh
   git add PKGBUILD .SRCINFO
   git commit -m "initial import"
   git push
   ```

Users can now install with their favourite AUR helper:

```sh
yay -S inkwell-bin
# or
paru -S inkwell-bin
```

### After each release

Once the GitHub workflow has published the new version:

1. In the AUR repo clone, bump `pkgver` in `PKGBUILD` to the new version
   (without the `v` prefix — e.g. `0.1.1`, not `v0.1.1`).
2. Reset `pkgrel=1` (only bump `pkgrel` if repackaging the same upstream
   version).
3. Refresh the AppImage checksum and `.SRCINFO`:

   ```sh
   updpkgsums
   makepkg --printsrcinfo > .SRCINFO
   ```

4. Sanity build:

   ```sh
   makepkg -si
   inkwell  # should launch
   ```

5. Commit + push:

   ```sh
   git add PKGBUILD .SRCINFO
   git commit -m "upgpkg: inkwell-bin 0.1.1-1"
   git push
   ```

### Keeping the upstream PKGBUILD in sync

The copy at `packaging/arch/PKGBUILD` in this repo is the canonical
template. When the AUR copy diverges (e.g. a user-submitted patch), fold
the changes back into this file so the next release starts from a
correct baseline.

## Checklist

- [ ] Version bumped in `client/src-tauri/tauri.conf.json`
- [ ] Changes committed
- [ ] Tag pushed (`v*` format)
- [ ] GH Actions release workflow green
- [ ] Release notes edited
- [ ] Draft published
- [ ] AUR `pkgver` + `.SRCINFO` bumped and pushed
