# Life Canvas OS 🎨

基于 Electron + Python + SQLite 的个人成长操作系统。

## 🌟 架构特点

- **Frontend**: React + TypeScript + Vite + Shadcn/ui
- **Desktop Shell**: Electron
- **Backend**: Python (FastAPI)
- **Database**: SQLite (SQLAlchemy ORM)
- **Architecture**: Monorepo with Dual-Mode Communication (IPC/HTTP)

## 🚀 快速开始

### 1. 环境准备

- Node.js 18+
- Python 3.10+

### 2. 后端设置

```bash
cd backend
# 创建虚拟环境
python -m venv venv
# 激活环境 (Windows)
source venv/Scripts/activate
# 安装依赖
pip install -r requirements.txt
# 初始化数据库
python -m backend.db.init_db
```
