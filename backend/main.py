# backend/main.py
import sys
import os
import uvicorn

# =========================================================
# 🪄 魔法代码：把项目根目录 (life-canvas-os) 加入 Python 搜索路径
# =========================================================
# 1. 拿到当前 main.py 所在的目录 (也就是 backend 目录)
current_dir = os.path.dirname(os.path.abspath(__file__))
# 2. 拿到上一级目录 (也就是 life-canvas-os 根目录)
project_root = os.path.dirname(current_dir)
# 3. 把根目录加入系统路径
sys.path.append(project_root)
# =========================================================

from fastapi import FastAPI
# 👇 这样写就完全没问题了，不用改其他任何文件
from backend.api.api import api_router 

app = FastAPI(title="Life Canvas OS Backend")

# ---------------------------------------------------------
# 1. 路由注册区域 (后续我们会在这里引入 api.router)
# ---------------------------------------------------------
app.include_router(api_router, prefix="/api/v1")
@app.get("/api/health")
def health_check():
    return {"status": "ok", "mode": "http" if "--dev" in sys.argv else "ipc"}

# ---------------------------------------------------------
# 2. IPC 模式核心逻辑 (生产环境)
# ---------------------------------------------------------
# 模拟路由映射：Action string -> Function
# 在真实开发中，这里会映射到 controller 函数
IPC_HANDLERS = {
    "ping": lambda params: {"action": "pong", "msg": "IPC Connected"},
    "health": lambda params: {"status": "healthy"}
}

def send_ipc_response(data: dict):
    """
    发送符合协议的响应：[Length]\n[JSON]
    """
    json_str = json.dumps(data)
    # 协议格式：长度 + 换行符 + 内容
    sys.stdout.write(f"{len(json_str.encode('utf-8'))}\n{json_str}")
    sys.stdout.flush()

def ipc_loop():
    """
    标准输入监听循环
    Electron 也就是父进程会往 stdin 写数据
    """
    buffer = ""
    while True:
        try:
            # 简单的行读取作为演示，真实场景建议按字符读取处理粘包
            # 文档建议：读取长度头 -> 读取指定长度的内容
            line = sys.stdin.readline()
            if not line:
                break
            
            # 假设 Electron 发送的是: 45\n{"id":"1","action":"ping"}
            # 这里简化处理，直接解析 JSON (开发阶段调试用)
            # 实际需严格按照 Design Doc 4.5.1 的 length-prefixed 协议实现
            
            # --- 简易版解析 (仅供演示连通性) ---
            try:
                # 尝试去掉可能存在的长度头，直接找 JSON
                json_part = line.strip() 
                if not json_part.startswith("{"): continue
                
                request = json.loads(json_part)
                req_id = request.get("id")
                action = request.get("action")
                params = request.get("params", {})
                
                # 路由分发
                handler = IPC_HANDLERS.get(action)
                if handler:
                    result = handler(params)
                    response = {"id": req_id, "success": True, "data": result}
                else:
                    response = {"id": req_id, "success": False, "error": "Unknown Action"}
                
                send_ipc_response(response)
                
            except json.JSONDecodeError:
                continue
                
        except Exception as e:
            sys.stderr.write(f"IPC Error: {str(e)}\n")

# ---------------------------------------------------------
# 3. 启动入口
# ---------------------------------------------------------
if __name__ == "__main__":
    if "--dev" in sys.argv:
        print("🚀 Starting in DEV mode (HTTP localhost:8000)...")
        # 开发模式：启动 HTTP 服务器，允许 Swagger 调试
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
    else:
        # 生产模式：启动 IPC 循环
        # 注意：不要打印任何非 JSON 的 log 到 stdout，否则会破坏 IPC 协议
        # 使用 stderr 打印日志
        sys.stderr.write("🚀 Starting in PROD mode (IPC)...\n")
        ipc_loop()