# backend/db/init_db.py
import sys
import os

# 将 backend 目录加入 python 路径，确保能导入 app 模块
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from backend.core.database import engine, SessionLocal, Base
from backend.models import UserProfile, SystemBase, SystemFuel

def init_db():
    print("🔄 初始化数据库表结构...")
    # 1. 创建所有表 (如果表不存在)
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 2. 检查并创建默认用户
        user = db.query(UserProfile).filter_by(id=1).first()
        if not user:
            print("👤 创建默认用户...")
            user = UserProfile(id=1, display_name="User", pin_hash="")
            db.add(user)
            db.commit()
        
        # 3. 检查并创建 8 大子系统
        # PRD 定义的 8 个系统类型
        SYSTEM_TYPES = [
            'FUEL', 'PHYSICAL', 'INTELLECTUAL', 'OUTPUT',
            'RECOVERY', 'ASSET', 'CONNECTION', 'ENVIRONMENT'
        ]
        
        for sys_type in SYSTEM_TYPES:
            exists = db.query(SystemBase).filter_by(user_id=1, type=sys_type).first()
            if not exists:
                print(f"⚙️ 创建子系统: {sys_type}...")
                new_sys = SystemBase(user_id=1, type=sys_type, score=50)
                db.add(new_sys)
                db.flush() # 获取 ID
                
                # 如果是饮食系统，还需要初始化专属表
                if sys_type == 'FUEL':
                    fuel_details = SystemFuel(system_id=new_sys.id)
                    db.add(fuel_details)
        
        db.commit()
        print("✅ 数据库初始化完成！")
        
    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()