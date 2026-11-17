# Upwork Job Dashboard: desktop app

Upwork's MCP login only works for apps running on your own computer, because it
accepts `localhost` redirect addresses only. The dashboard can't be hosted on a
website, so it ships as a desktop app instead. Each person installs it and logs
in with their own Upwork account. Their jobs, drafts and keys stay on their own
computer.

## Install

Download the installer for your system from the latest GitHub Release (or from
the artifacts of the latest "Desktop app" workflow run).

The app isn't signed with a paid Apple or Microsoft certificate yet, so the
first launch shows a warning.

| System | File | First launch |
|---|---|---|
| macOS (Apple Silicon) | `…-arm64.dmg` | Drag the app to Applications and open it. If macOS blocks it, go to System Settings → Privacy & Security and click **Open Anyway**. |
| macOS (Intel) | `…-x64.dmg` (no `arm64` in the name) | Same as above. |
| Windows | `….exe` | If SmartScreen appears, click **More info → Run anyway**. |
| Linux | `….AppImage` | `chmod +x Upwork*.AppImage`, then run it. Some distros also need `libfuse2`. |

## First use

1. The app asks for an **OpenAI API key**, which it needs for job scores and
   drafts. You can skip this step and add the key later from
   **File → Set OpenAI API key…**.
2. Click **Connect**. Upwork's login opens in your normal browser. Approve
   access there.
3. Switch back to the app. It now shows **Connected · <your profile>**.

The app uses local port **47831**. If another program is using that port, the
app shows an error and won't start.

## Where things are stored

**File → Open data folder** opens the app's data folder. It contains:

- `data/`: the login session and one database per Upwork profile
- `config.json`: the OpenAI key
- `server.log`: logs from the built-in server, which help with debugging

## Building it yourself

```bash
npm ci                         # in the repo root
cd desktop && npm ci
npm start                      # build the server and open the app
npm run dist:mac               # or dist:win / dist:linux, on that OS
```

Build each installer on its own operating system. The **Desktop app** GitHub
workflow builds all three. To publish a release, push a tag such as `v0.1.0`.

When you run `npm start` from a terminal inside VS Code, unset
`ELECTRON_RUN_AS_NODE` first. VS Code sets this variable, and it makes Electron
start as plain Node.
