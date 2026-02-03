"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    // 这里暴露给前端 React 用的 API，目前先留空，后续写 IPC 时加
    ping: () => electron_1.ipcRenderer.invoke("ping"),
});
