import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("replay", {
  call: (command: unknown) => ipcRenderer.invoke("replay:call", command),
  onFeed: (fn: (value: any) => void) => {
    const callback = (_e: unknown, value: any) => fn(value);
    ipcRenderer.on("replay:feed", callback);
    return () => ipcRenderer.removeListener("replay:feed", callback);
  },
  subscribe: (fn: (state: any) => void) => {
    const callback = (_e: unknown, state: any) => fn(state);
    ipcRenderer.on("replay:state", callback);
    return () => ipcRenderer.removeListener("replay:state", callback);
  },
  onAI: (fn: (value: any) => void) => {
    const callback = (_e: unknown, value: any) => fn(value);
    ipcRenderer.on("replay:ai", callback);
    return () => ipcRenderer.removeListener("replay:ai", callback);
  },
  flush: (fn: () => Promise<void>) => {
    ipcRenderer.removeAllListeners("replay:prepare-close");
    ipcRenderer.on("replay:prepare-close", () => {
      fn()
        .then(() => ipcRenderer.send("replay:flushed"))
        .catch(() => {});
    });
  },
});
