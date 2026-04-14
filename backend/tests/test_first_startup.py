"""测试首次启动逻辑

使用延迟导入避免 collection 阶段触发所有依赖
"""
import os
import sys
from pathlib import Path

# 添加项目根目录到路径（tests -> backend -> 项目根目录）
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))


def test_first_startup():
    """测试首次启动时的数据库初始化"""
    # 延迟导入，避免 collection 阶段失败
    import shutil
    from backend.db.session import SessionLocal
    from backend.db.init_db import ensure_database_initialized, is_database_empty
    from backend.models.user import User
    from backend.models.dimension import System

    print("="*50)
    print("Testing First Startup Scenario")
    print("="*50)

    # 1. 备份现有数据库（如果存在）
    db_path = project_root / "backend" / "life_canvas.db"
    backup_path = project_root / "backend" / "life_canvas.db.backup"

    if db_path.exists():
        print(f"[INFO] Found existing database, backing up...")
        shutil.copy2(db_path, backup_path)
        print(f"[OK] Backed up to: {backup_path}")

    # 2. 删除现有数据库
    if db_path.exists():
        print(f"[INFO] Removing existing database...")
        os.remove(db_path)
        print(f"[OK] Database removed")

    # 3. 检查数据库是否为空
    print("\n[INFO] Checking if database is empty...")
    is_empty = is_database_empty()
    print(f"[INFO] Database empty: {is_empty}")

    # 4. 模拟应用启动
    print("\n[INFO] Simulating app startup...")
    db = SessionLocal()
    try:
        was_initialized = ensure_database_initialized(db)
        print(f"[OK] Auto-initialization completed: {was_initialized}")

        # 5. 验证数据
        user_count = db.query(User).count()
        system_count = db.query(System).count()

        print(f"\n[INFO] Verification:")
        print(f"  - Users: {user_count}")
        print(f"  - Systems: {system_count}")

        if user_count > 0 and system_count == 8:
            print("\n[SUCCESS] First startup test PASSED!")
            return True
        else:
            print("\n[FAIL] First startup test FAILED!")
            return False

    except Exception as e:
        print(f"\n[ERROR] First startup test FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        db.close()

    # 6. 清理
    if backup_path.exists():
        print("\n[INFO] Cleaning up...")
        shutil.copy2(backup_path, db_path)
        os.remove(backup_path)
        print("[OK] Restored original database")


if __name__ == "__main__":
    success = test_first_startup()
    sys.exit(0 if success else 1)
