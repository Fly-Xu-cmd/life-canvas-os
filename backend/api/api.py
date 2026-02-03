from fastapi import APIRouter
from backend.api.endpoints import systems

api_router = APIRouter()

# 注册 systems 路由
api_router.include_router(systems.router, prefix="/systems", tags=["systems"])

# 后续可以在这里加 users, journals 等路由
# api_router.include_router(users.router, prefix="/users", tags=["users"])