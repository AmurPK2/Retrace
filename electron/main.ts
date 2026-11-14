import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
  screen,
  safeStorage,
} from "electron";
import { Worker } from "node:worker_threads";
import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
  appendFileSync,
} from "node:fs";
import path from "node:path";
import { SHELL, appearanceShell } from "../src/core/appearance";
import { lessonSource } from "../src/core/rr-lessons";
import { configureTelegram, telegramConfigSchema, type TelegramConfig } from "./telegram-config";
import { DiscordPresence } from "./discord";
import { DEFAULT_DISCORD } from "../src/core/discord-presence";
const project =
  process.env.XAU_REPLAY_PROJECT_ROOT || (app.isPackaged ? path.dirname(process.execPath) : process.cwd());
const root = process.env.XAU_REPLAY_DATA || path.join(project, "data");
mkdirSync(root, { recursive: true });
app.setPath("userData", path.join(root, "electron"));
app.setName("RETRACE");
app.setAppUserModelId("com.retrace.desktop");
const telegramFile=path.join(root,"telegram-settings.enc");
function readTelegram():TelegramConfig|null {if(!existsSync(telegramFile))return null;try{return telegramConfigSchema.parse(JSON.parse(safeStorage.decryptString(readFileSync(telegramFile))));}catch{return null;}}
function saveTelegram(value:TelegramConfig) {if(!safeStorage.isEncryptionAvailable())throw Error("Windows private storage is unavailable. Telegram credentials were not saved.");const validated=telegramConfigSchema.parse(value);writeFileSync(telegramFile+".tmp",safeStorage.encryptString(JSON.stringify(validated)));require("node:fs").renameSync(telegramFile+".tmp",telegramFile);}
let window: BrowserWindow | null = null,
  worker: Worker,
  watchdog: ChildProcess,
  allowedQuit = false,
  closePromise: Promise<void> | null = null,
  id = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
let lastState: any = null;
const discordPresence = new DiscordPresence(status => {
  if (lastState) {
    lastState.discordStatus = status;
    window?.webContents.send("replay:state", lastState);
  }
});
let flushAck: (() => void) | null = null;
function call(command: any, timeout = 240000) {
  return new Promise<any>((resolve, reject) => {
    const key = ++id,
      timer = setTimeout(() => {
        pending.delete(key);
        reject(
          Error(
            "The background worker is not responding. The last saved checkpoint is preserved.",
          ),
        );
      }, timeout);
    pending.set(key, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    worker.postMessage({ id: key, command });
  });
}
async function graceful() {
  if (closePromise) return closePromise;
  closePromise = (async () => {
    try {
      await call({ type: "freeze" });
      if (window && !window.isDestroyed()) {
        window.webContents.send("replay:prepare-close");
        await new Promise<void>((resolve, reject) => {
          flushAck = resolve;
          setTimeout(() => {
            if (flushAck) {
              flushAck = null;
              reject(
                Error("Could not confirm the latest text drafts were saved."),
              );
            }
          }, 8000);
        });
      }
      await Promise.all([call({ type: "shutdown" }), discordPresence.shutdown()]);
      if (watchdog?.connected) watchdog.send({ type: "finished" });
      await worker.terminate();
      allowedQuit = true;
      window?.destroy();
      app.quit();
    } catch (e) {
      closePromise = null;
      const result = await dialog.showMessageBox(window!, {
        type: "error",
        title: "Shutdown is incomplete",
        message: "Work or AI cleanup could not be confirmed.",
        detail:
          String(e) +
          "\nThe app is still open. You can try saving and exiting again.",
        buttons: ["Try again", "Keep open"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) void graceful();
    }
  })();
  return closePromise;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    window?.show();
    window?.focus();
  });
  app.whenReady().then(() => {
    worker = new Worker(path.join(__dirname, "worker.cjs"), {
      workerData: { root, project, parentPid: process.pid, autoSetup: true, telegramConfig: readTelegram() },
    });
    worker.on("message", (m) => {
      if (m.id) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p?.reject(Error(m.error)) : p?.resolve(m.value);
      } else if (m.event === "state") {
        m.value.discordStatus = discordPresence.status;
        lastState = m.value;
        discordPresence.update(m.value.discord ?? DEFAULT_DISCORD, m.value.session);
        if (window && !window.isDestroyed()) {
          const shell = appearanceShell(m.value.appearance?.preset);
          window.setTitleBarOverlay({
            color: shell.bg,
            symbolColor: shell.text,
            height: 32,
          });
        }
        window?.webContents.send("replay:state", m.value);
      } else if (m.event === "telegram-save") {
        try { saveTelegram(m.value); } catch { window?.webContents.send("replay:ai", {event:"error",value:"Telegram login could not be saved to encrypted Windows storage."}); }
      } else if (m.event === "feed") {
        window?.webContents.send("replay:feed", m.value);
      } else if (
        m.event === "ai" ||
        m.event === "token" ||
        m.event === "error"
      ) {
        window?.webContents.send("replay:ai", m);
      }
    });
    worker.on("error", (e) => {
      for (const p of pending.values()) p.reject(e);
      pending.clear();
      window?.webContents.send("replay:ai", {
        event: "error",
        value: "Background worker stopped: " + String(e),
      });
    });
    const watchdogLog = path.join(root, "watchdog.log");
    const watchdogFd = openSync(watchdogLog, "a");
    watchdog = spawn(
      process.execPath,
      [path.join(__dirname, "watchdog.cjs"), String(process.pid), root],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        windowsHide: true,
        detached: true,
        stdio: ["ignore", watchdogFd, watchdogFd, "ipc"],
      },
    );
    closeSync(watchdogFd);
    appendFileSync(
      watchdogLog,
      JSON.stringify({
        at: Date.now(),
        event: "spawn",
        parent: process.pid,
        pid: watchdog.pid,
      }) + "\n",
    );
    watchdog.on("error", (e) =>
      appendFileSync(
        watchdogLog,
        JSON.stringify({
          at: Date.now(),
          event: "spawn-error",
          error: String(e),
        }) + "\n",
      ),
    );
    watchdog.on("exit", (code, signal) =>
      appendFileSync(
        watchdogLog,
        JSON.stringify({ at: Date.now(), event: "exit", code, signal }) + "\n",
      ),
    );
    watchdog.unref();
    watchdog.channel?.unref();
    const workArea = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workAreaSize;
    window = new BrowserWindow({
      width: Math.min(1536, workArea.width),
      height: Math.min(970, workArea.height),
      minWidth: Math.min(1100, workArea.width),
      minHeight: Math.min(720, workArea.height),
      backgroundColor: SHELL.bg,
      title: "RETRACE",
      icon: path.join(app.getAppPath(), "assets/RETRACE.ico"),
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: SHELL.bg,
        symbolColor: SHELL.text,
        height: 32,
      },
      show: !process.argv.includes("--smoke-hidden"),
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.on("close", (e) => {
      if (!allowedQuit) {
        e.preventDefault();
        void graceful();
      }
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      const target = new URL(url);
      if (
        target.protocol === "https:" &&
        target.hostname === "www.tradingview.com" &&
        target.pathname === "/"
      )
        void shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (e, url) => {
      if (
        !url.startsWith("file:") &&
        !url.startsWith("http://127.0.0.1:19852/")
      )
        e.preventDefault();
    });
    const development = process.env.XAU_REPLAY_DEV === "1";
    if (development) void window.loadURL("http://127.0.0.1:19852");
    else void window.loadFile(path.join(__dirname, "../dist/index.html"));
    window.webContents.on("did-finish-load", () => {
      if (lastState) window!.webContents.send("replay:state", lastState);
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "App",
          submenu: [
            {
              label: "Exit",
              accelerator: "Alt+F4",
              click: () => void graceful(),
            },
          ],
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
        {
          label: "View",
          submenu: [
            { role: "togglefullscreen" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { role: "resetZoom" },
          ],
        },
      ]),
    );
  });
  app.on("before-quit", (e) => {
    if (!allowedQuit && worker) {
      e.preventDefault();
      void graceful();
    }
  });
  app.on("window-all-closed", () => {
    if (allowedQuit) app.quit();
  });
}
const allowed = new Set([
  "study.progress",
  "study.context",
  "study.range",
  "study.overlay",
  "study.draft",
  "study.commit",
  "study.reveal",
  "study.review",
  "study.attempt",
  "appearance",
  "feed.configure",
  "feed.read",
  "feed.start",
  "feed.seen",
  "feed.link",
  "feed.link.cancel",
  "feed.password",
  "feed.cancel",
  "viewport",
  "state",
  "sessions.eligible",
  "sessions.new",
  "sessions.continue",
  "sessions.rename",
  "sessions.fork",
  "play",
  "speed",
  "step",
  "order",
  "position.close",
  "position.edit",
  "pending.cancel",
  "pending.edit",
  "specs",
  "risk",
  "drawings",
  "drawing.undo",
  "drawing.redo",
  "flush",
  "ui",
  "indicators",
  "notebook",
  "note",
  "image",
  "stats",
  "import.start",
  "import.pause",
  "datasets",
  "dataset",
  "discord.settings",
  "ai.health",
  "ai.settings",
  "ai.rollback",
  "ai.toggle",
  "ai.cancel",
  "ai.ask",
]);
ipcMain.handle("replay:call", async (event, c) => {
  if (
    event.sender !== window?.webContents ||
    !event.senderFrame?.url.match(/^(file:|http:\/\/127\.0\.0\.1:19852\/)/)
  )
    throw Error("Unknown sender.");
  if (!c || typeof c !== "object" || typeof c.type !== "string")
    throw Error("Invalid command.");
  if (closePromise && !["flush", "state", "study.draft"].includes(c.type))
    throw Error("The app is closing.");
  if (c.type === "feed.configure") {const value=configureTelegram(c,readTelegram());saveTelegram(value);await call({type:"feed.configure",value});return;}
  if (c.type === "app.exit") {
    void graceful();
    return;
  }
  if (c.type === "discord.portal") return shell.openExternal("https://discord.com/developers/applications");
  if (c.type === "discord.icon") {
    shell.showItemInFolder(path.join(project, "assets/RETRACE.png"));
    return;
  }
  if (c.type === "state") return { ...await call(c), discordStatus: discordPresence.status };
  if (c.type === "study.source") {
    return shell.openExternal(lessonSource(c.lesson, c.index));
  }
  if (c.type === "backup.export") {
    const data = await call({ type: "sessions.export" });
    const result = await dialog.showSaveDialog(window!, {
      defaultPath: path.join(project, "backups", `replay-${Date.now()}.json`),
      filters: [{ name: "Replay backup", extensions: ["json"] }],
    });
    if (!result.canceled && result.filePath) {
      mkdirSync(path.dirname(result.filePath), { recursive: true });
      const tmp = result.filePath + ".tmp";
      writeFileSync(tmp, JSON.stringify(data));
      const { renameSync } = await import("node:fs");
      renameSync(tmp, result.filePath);
      return result.filePath;
    }
    return null;
  }
  if (c.type === "backup.import") {
    const result = await dialog.showOpenDialog(window!, {
      filters: [{ name: "Replay backup", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (!result.canceled) {
      const file = result.filePaths[0];
      const { statSync } = await import("node:fs");
      if (statSync(file).size > 100000000)
        throw Error("The backup exceeds 100 MB.");
      return call({
        type: "sessions.import",
        backup: JSON.parse(readFileSync(file, "utf8")),
      });
    }
    return;
  }
  if (c.type === "storage.choose") {
    const result = await dialog.showOpenDialog(window!, {
      defaultPath: path.join(project, "data"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    return call({ type: "storage", directory: result.filePaths[0] });
  }
  if (c.type === "csv.choose") {
    const result = await dialog.showOpenDialog(window!, {
      filters: [{ name: "Tick CSV", extensions: ["csv", "tsv", "txt"] }],
      properties: ["openFile"],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    selectedCSV = file;
    const { openSync, readSync, closeSync } = await import("node:fs");
    const fd = openSync(file, "r"),
      buffer = Buffer.alloc(8192);
    const n = readSync(fd, buffer, 0, 8192, 0);
    closeSync(fd);
    return {
      file,
      preview: buffer
        .subarray(0, n)
        .toString("utf8")
        .split(/\r?\n/)
        .slice(0, 6),
    };
  }
  if (c.type === "csv.import") {
    if (!selectedCSV) throw Error("Select a CSV file first.");
    return call({ type: "import.csv", file: selectedCSV, mapping: c.mapping });
  }
  if (!allowed.has(c.type)) throw Error("This command is not allowed.");
  if (
    c.type === "ai.settings" &&
    c.value?.runtime &&
    path.resolve(c.value.runtime) !==
      path.resolve(project, "runtime/lmstudio/bin/lms.exe")
  )
    throw Error(
      "This app uses only its verified project-local LM Studio runtime.",
    );
  return call(c);
});
let selectedCSV = "";
ipcMain.on("replay:flushed", (event) => {
  if (event.sender === window?.webContents && flushAck) {
    const ack = flushAck;
    flushAck = null;
    ack();
  }
});
