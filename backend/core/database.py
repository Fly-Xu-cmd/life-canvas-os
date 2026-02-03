# backend/core/database.py
import os
import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 1. 确定数据存储路径 (文档 4.4.1)
if os.name == 'nt':  # Windows
    DATA_DIR = Path(os.environ.get('APPDATA')) / 'Life Canvas OS'
else:  # macOS / Linux
    DATA_DIR = Path.home() / 'Library' / 'Application Support' / 'Life Canvas OS' \
        if sys.platform == 'darwin' else Path.home() / '.config' / 'life-canvas-os'

DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / 'data.db'

# 2. 创建 SQLite 引擎
# check_same_thread=False 是 SQLite 在 FastAPI 多线程下必需的
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 3. 依赖注入 Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()