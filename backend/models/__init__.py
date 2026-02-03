# backend/models/__init__.py
from backend.models.user import UserProfile
from backend.models.system import SystemBase, SystemFuel

# 这里把所有 Model 都导出来，方便 Alembic 和 init_db 识别
# 如果以后加了 Journal, Insight 等模型，也要加在这里