from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.models import SystemBase

router = APIRouter()

@router.get("/")
def read_systems(db: Session = Depends(get_db)):
    """
    获取所有子系统状态 (用于雷达图)
    """
    systems = db.query(SystemBase).filter(SystemBase.user_id == 1).all()
    return systems

@router.patch("/{system_type}/score")
def update_score(system_type: str, score: int, db: Session = Depends(get_db)):
    """
    更新系统分数
    """
    system = db.query(SystemBase).filter(
        SystemBase.user_id == 1, 
        SystemBase.type == system_type.upper()
    ).first()
    
    if not system:
        raise HTTPException(status_code=404, detail="System not found")
    
    system.score = score
    db.commit()
    return {"success": True, "new_score": system.score}