import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // 这里暴露给前端 React 用的 API，目前先留空，后续写 IPC 时加
  ping: () => ipcRenderer.invoke("ping"),
});
