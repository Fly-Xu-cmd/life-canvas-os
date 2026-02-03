from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from backend.core.database import Base

class SystemBase(Base):
    __tablename__ = "systems_base"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user_profile.id"), nullable=False, default=1)
    type = Column(String, nullable=False) # FUEL, PHYSICAL, etc.
    score = Column(Integer, default=50)
    
    __table_args__ = (UniqueConstraint('user_id', 'type', name='uix_user_type'),)

# 示例：饮食系统专属表
class SystemFuel(Base):
    __tablename__ = "systems_fuel"
    
    system_id = Column(Integer, ForeignKey("systems_base.id"), primary_key=True)
    consistency = Column(Integer, default=0)
    baseline_breakfast = Column(String) # 存 JSON 字符串