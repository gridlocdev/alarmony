# Development

Alarmony is a TypeScript pnpm workspace. One Preact build runs in the browser and inside the Electron app. [Architecture](architecture.md) explains the layout, and the [product requirements](plans/prd.md) say exactly how everything behaves.

## Getting set up

You need Node 22.18 or later, pnpm (through corepack) and [just](https://github.com/casey/just). Run `just` on its own to list every recipe.

```bash
just setup   # corepack enable, then pnpm install
```

### Running it

| Recipe | What it runs |
| --- | --- |
| `just run-web` | The web client on http://localhost:5173 with hot reload. It keeps `clock.json` in the browser's storage |
| `just run-desktop` | The desktop app in dev mode (builds the web client first) |
| `just cli <args>` | The `alarmony` command from source, for example `just cli alarms --dir /tmp/alarmony-try`. `just cli man` lists every command |
| `just run-desktop-headless` | The desktop app with no window or Dock icon, on a throwaway folder removed when it exits, with DevTools on port 9334 (for automated checks) |

The desktop app in dev mode uses your real `Documents/Alarmony`. To try it on throwaway data, set `ALARMONY_USER_DATA` to another folder; the data folder then sits inside it:

```bash
ALARMONY_USER_DATA=/tmp/alarmony-try just run-desktop
```

## Checking your work

```bash
just check        # everything CI runs: format, lint, typecheck, tests, build
just test         # the tests once (pass a file or -t "name" to narrow them)
just test-watch   # the tests in watch mode
just lint         # ESLint
just typecheck    # tsc -b
just fmt          # format every file with Prettier
just fmt-check    # check formatting without changing anything
just fuzz         # the random-edit tests on 500 seeds (FUZZ_SEED=<n> replays one)
just diagram      # redraw the save diagram in architecture.md from its table
just e2e          # browser scenarios in headless Chromium (pass a file or -g "name")
just e2e-update   # accept new screenshots, after looking at the diff in .e2e-results
just e2e-desktop  # the built desktop app starts headless on a throwaway folder
just soak         # the random tests long, on new seeds from the clock: before a release, or while you're away
just drive aria   # a quick headless look: cmd:"Stopwatch" key:Space shot:after aria
```

Tests live in each package's `test/` folder and run in Node with Vitest. `apps/web/test/controls.test.ts` fails when [Controls](controls.md) and the command catalog disagree, so update that page with any shortcut you add or change.

Browser scenarios live in `e2e/`, one `test.describe` per `##` heading of [Features](features.md); `apps/web/test/features.test.ts` fails when a feature has no scenarios. They run against the built client served as static files, each in a fresh browser with empty storage, with the page clock starting at 15 January 2027 (`page.clock.runFor` moves it on, so a timer finishes without a wait). `random-ui.spec.ts` runs a few seeds of random commands, typing and keys; a failure prints `FUZZ_SEED=<n> just e2e -g random` to replay it.

Check UI changes without a visible window: `just drive` (`just drive --phone` for an iPhone-sized touch screen), the scenarios, or the desktop app started with `just run-desktop-headless`. Never point a check at your real data: use `ALARMONY_USER_DATA` (and `ALARMONY_FOLDER`) for the desktop app.

## The spec

[docs/plans/prd.md](plans/prd.md) is the spec, in numbered sections. Code cites it (`// PRD §4.6`). When you change a behaviour, change its section in the same commit. If a behaviour isn't in the PRD, decide it and write it down there first.

## Adding a command

Every action is a command in `apps/web/src/app/commands.ts`: an id, a title, a one-sentence description, a group, its shortcuts and what it runs. From that one entry it appears in the command menu, the menu bar and the Keyboard Shortcuts window. Don't wire a key or a menu item anywhere else. Then add the shortcut to [Controls](controls.md).

## Building and packaging the desktop app

```bash
just build                # the web client and the desktop main process
just build-desktop        # the desktop app only, into apps/desktop/out
just package-desktop      # a .dmg and .zip (macOS), AppImage (Linux) or installer (Windows)
just package-desktop-dir  # an unpacked app only, faster for local testing
just install-desktop      # macOS: package and install into /Applications
```

- The package is signed ad hoc so it runs on Apple silicon. Swap the identity in `apps/desktop/electron-builder.yml` for a Developer ID to distribute it.
- Packaging sets Electron fuses (`electronFuses` in `apps/desktop/electron-builder.yml`, applied before signing): the app can't be run as plain Node, `NODE_OPTIONS` and `--inspect` are ignored, it loads only from `app.asar` and checks that file's integrity, and `file://` pages get no extra privileges. Check a build with `npx @electron/fuses read --app apps/desktop/release/mac-arm64/Alarmony.app`.
- `just install-desktop` moves an existing copy to the Trash first. If Alarmony is running, it asks first, quits it the normal way so it saves, installs, and opens it again; **Cancel** leaves it running and installs nothing.

### The app icon

The icon is drawn by hand in `apps/desktop/assets/icon.svg`: a 1024 canvas on Apple's grid, with the 824-unit tile at (100, 100). After editing it, render the platform files and commit them, so builds don't need Inkscape:

```bash
just icons  # icon.icns (macOS), icon.ico (Windows) and icon.png (Linux window) in apps/desktop/build
```

It needs Inkscape (`brew install --cask inkscape`) and, for the `.icns`, macOS. If the Dock still shows the old icon after a rebuild, that is the macOS icon cache: move the app, or log out and back in.

## Releasing

Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`. It packages the desktop app on macOS (Apple silicon and Intel), Windows and Linux, and publishes them on a GitHub release.

1. Set the same version in every `package.json` under `apps/` and `packages/`. The workflow stops if the tag doesn't match `apps/desktop/package.json`.
2. Rename `## Unreleased` in `CHANGELOG.md` to `## X.Y.Z`. It becomes the release notes.
3. Run `just check`, commit ("Version X.Y.Z"), then tag and push:

   ```bash
   git tag -a vX.Y.Z -m "Alarmony X.Y.Z"
   git push origin main vX.Y.Z
   ```

`.github/workflows/check.yml` runs `pnpm check` on Linux, macOS and Windows for every pull request. Run it by hand from the repository's **Actions** tab, or with `gh workflow run check.yml`.

## Cleaning up

```bash
just clean        # remove build output
just clean-all    # also remove every node_modules (run just setup after)
```
