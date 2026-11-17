// Only the key window gets this preload; the dashboard window has no bridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  hasKey: () => ipcRenderer.invoke("key:get"),
  saveKey: (key) => ipcRenderer.invoke("key:save", key),
});
