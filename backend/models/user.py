from sqlalchemy import Column, Integer, String, Boolean, Date, Text, TIMESTAMP
from sqlalchemy.sql import func
from backend.core.database import Base

class UserProfile(Base):
    __tablename__ = "user_profile"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pin_hash = Column(String, nullable=False, default="")
    display_name = Column(String, default="User")
    # 文档中的其他字段...
    created_at = Column(TIMESTAMP, server_default=func.now())