// Desktop shell for the Upwork job dashboard.
//
// Upwork's MCP login only accepts localhost redirect URIs for self-registered
// apps, so the dashboard has to run on each user's own computer. This app runs
// the bundled Next.js server on 127.0.0.1 and shows it in a window. Upwork's
// login page opens in the system browser (so Google sign-in works); Upwork then
// redirects back to the local server, which saves the tokens.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

// Fixed, so the redirect URI saved at registration stays valid across launches.
const PORT = 47831;
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:${PORT}`;

const userData = app.getPath("userData");
const dataDir = path.join(userData, "data");
const configFile = path.join(userData, "config.json");
const logFile = path.join(userData, "server.log");

let server = null;
let mainWindow = null;
let keyWindow = null;
let awaitingLogin = false;
let quitting = false;

// ---------- config (OpenAI key) ----------

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// ---------- local server ----------

function serverDir() {
  return app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "server");
}

function portIsFree() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(PORT, HOST);
  });
}

function startServer() {
  const config = readConfig();
  fs.mkdirSync(dataDir, { recursive: true });
  const log = fs.createWriteStream(logFile, { flags: "a" });
  log.write(`\n--- start ${new Date().toISOString()} ---\n`);

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: HOST,
    APP_URL: ORIGIN,
    APP_DATA_DIR: dataDir,
  };
  if (config.openaiApiKey) env.OPENAI_API_KEY = config.openaiApiKey;
  else delete env.OPENAI_API_KEY;

  server = utilityProcess.fork(path.join(serverDir(), "server.js"), [], {
    cwd: serverDir(),
    env,
    stdio: "pipe",
    serviceName: "Upwork Job Dashboard server",
  });
  server.stdout?.on("data", (d) => log.write(d));
  server.stderr?.on("data", (d) => log.write(d));
  const child = server;
  child.on("exit", (code) => {
    log.end(`--- exit ${code} ---\n`);
    if (server === child) server = null;
    if (!quitting && code !== 0 && child.expectedExit !== true) {
      dialog.showErrorBox(
        "Server stopped",
        `The dashboard's local server stopped unexpectedly (code ${code}).\n\nLog: ${logFile}`,
      );
    }
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    const child = server;
    child.expectedExit = true;
    child.once("exit", () => resolve());
    child.kill();
  });
}

function waitForServer(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${ORIGIN}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("The local server did not start in time."));
        else setTimeout(attempt, 300);
      });
      req.setTimeout(5000, () => req.destroy());
    };
    attempt();
  });
}

async function restartServer() {
  await stopServer();
  startServer();
  await waitForServer();
  mainWindow?.loadURL(`${ORIGIN}/`);
}

// ---------- windows ----------

function isLocal(url) {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
}

function openOutside(url) {
  if (/^https?:\/\//.test(url)) {
    if (url.includes("oauth2/authorize")) awaitingLogin = true;
    shell.openExternal(url);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: "Upwork Job Dashboard",
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  const wc = mainWindow.webContents;
  // Anything outside the local app (Upwork login, job links) goes to the system browser.
  const guard = (event, url) => {
    if (!isLocal(url)) {
      event.preventDefault();
      openOutside(url);
    }
  };
  wc.on("will-navigate", guard);
  wc.on("will-redirect", guard);
  wc.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) return { action: "allow" };
    openOutside(url);
    return { action: "deny" };
  });

  // After login in the browser, show the connected state when the user comes back.
  mainWindow.on("focus", () => {
    if (awaitingLogin) {
      awaitingLogin = false;
      mainWindow.loadURL(`${ORIGIN}/`);
    }
  });
  mainWindow.on("closed", () => (mainWindow = null));
  mainWindow.loadURL(`${ORIGIN}/`);
}

function openKeyWindow() {
  if (keyWindow) return keyWindow.focus();
  keyWindow = new BrowserWindow({
    width: 520,
    height: 330,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow ?? undefined,
    modal: Boolean(mainWindow),
    title: "OpenAI API key",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  keyWindow.setMenu(null);
  keyWindow.on("closed", () => (keyWindow = null));
  keyWindow.loadFile(path.join(__dirname, "key.html"));
}

ipcMain.handle("key:get", () => Boolean(readConfig().openaiApiKey));
ipcMain.handle("key:save", async (_e, key) => {
  const config = readConfig();
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (trimmed) config.openaiApiKey = trimmed;
  else delete config.openaiApiKey;
  writeConfig(config);
  keyWindow?.close();
  await restartServer();
  return true;
});

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "Set OpenAI API key…", click: openKeyWindow },
        { label: "Open data folder", click: () => shell.openPath(userData) },
        { label: "Open in browser", click: () => shell.openExternal(`${ORIGIN}/`) },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Home", accelerator: "CmdOrCtrl+H", click: () => mainWindow?.loadURL(`${ORIGIN}/`) },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- app lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    buildMenu();
    if (!(await portIsFree())) {
      dialog.showErrorBox(
        "Port in use",
        `Port ${PORT} is already in use by another program, so the dashboard can't start.\n\nClose that program and open the app again.`,
      );
      return app.quit();
    }
    startServer();
    try {
      await waitForServer();
    } catch (err) {
      dialog.showErrorBox("Could not start", `${err.message}\n\nLog: ${logFile}`);
      return app.quit();
    }
    createMainWindow();
    if (!readConfig().openaiApiKey) openKeyWindow();

    app.on("activate", () => {
      if (!mainWindow) createMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", (event) => {
    if (quitting || !server) return;
    quitting = true;
    event.preventDefault();
    stopServer().then(() => app.quit());
  });
}
