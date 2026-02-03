"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
// 定义全局变量防止被垃圾回收
let mainWindow = null;
let pythonProcess = null;
const isDev = process.env.NODE_ENV === "development";
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    if (isDev) {
        // 开发模式：加载 Vite 的本地服务地址
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools(); // 打开控制台方便调试
    }
    else {
        // 生产模式：加载打包后的 HTML
        mainWindow.loadFile(path_1.default.join(__dirname, "../dist/index.html"));
    }
}
// 🔥 启动 Python 后端
function startPythonBackend() {
    if (isDev) {
        // 开发模式：直接调用 venv 下的 python
        // 注意：这里需要根据你的实际路径调整，这里假设从 apps/desktop 回退两级找到 backend
        const projectRoot = path_1.default.join(__dirname, "../../..");
        const pythonPath = path_1.default.join(projectRoot, "backend/venv/Scripts/python.exe"); // Windows 路径
        const scriptPath = path_1.default.join(projectRoot, "backend/main.py");
        console.log("🚀 Starting Python backend...");
        console.log("Python Path:", pythonPath);
        console.log("Script Path:", scriptPath);
        pythonProcess = (0, child_process_1.spawn)(pythonPath, [scriptPath, "--dev"]);
        pythonProcess.stdout?.on("data", (data) => {
            console.log(`[Python]: ${data}`);
        });
        pythonProcess.stderr?.on("data", (data) => {
            console.error(`[Python Error]: ${data}`);
        });
    }
    else {
        // 生产模式逻辑（打包后再写，暂时留空）
    }
}
electron_1.app.whenReady().then(() => {
    startPythonBackend(); // 先启动后端
    createWindow(); // 再启动窗口
});
// 退出应用时杀掉 Python 进程
electron_1.app.on("will-quit", () => {
    if (pythonProcess) {
        pythonProcess.kill();
    }
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
