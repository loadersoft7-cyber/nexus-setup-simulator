const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexus", {
  minimize: () => ipcRenderer.send("window-min"),
  maximize: () => ipcRenderer.send("window-max"),
  close: () => ipcRenderer.send("window-close"),
});
