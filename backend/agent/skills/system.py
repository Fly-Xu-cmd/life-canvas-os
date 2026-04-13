"""
系统评分技能
处理八维系统评分的查询和更新

使用 Tools：
- DatabaseTool: 数据 CRUD
"""
from typing import List

from backend.agent.skills.base import BaseSkill, RiskLevel, SkillResult, SkillParameter
from backend.agent.skills.registry import register_skill
from backend.agent.utils.logger import get_logger

logger = get_logger("system")


# 系统类型中文映射
SYSTEM_TYPE_NAMES = {
    "FUEL": "饮食系统",
    "PHYSICAL": "运动系统",
    "INTELLECTUAL": "读书系统",
    "OUTPUT": "工作系统",
    "DREAM": "梦想系统",
    "ASSET": "财务系统",
    "CONNECTION": "社交系统",
    "ENVIRONMENT": "环境系统"
}

# 系统类型枚举值（用于参数约束）
SYSTEM_TYPE_ENUMS = list(SYSTEM_TYPE_NAMES.keys())


@register_skill
class GetSystemScoresSkill(BaseSkill):
    """获取系统评分技能"""

    @property
    def name(self) -> str:
        return "get_system_scores"

    @property
    def description(self) -> str:
        return "获取八维系统的评分"

    @property
    def risk_level(self) -> RiskLevel:
        return RiskLevel.LOW

    @property
    def parameters(self) -> List[SkillParameter]:
        return [
            SkillParameter(
                name="system_type",
                type="string",
                description="系统类型（不指定则返回所有）",
                required=False,
                enum=SYSTEM_TYPE_ENUMS
            )
        ]

    @property
    def keywords(self) -> List[str]:
        return ["评分", "系统评分", "八维评分", "我的分数"]

    @property
    def examples(self) -> List[str]:
        return ["我的评分是多少？", "查看运动系统评分", "所有系统的评分"]

    async def execute(self, **kwargs) -> SkillResult:
        """执行获取评分"""
        system_type = kwargs.get("system_type")

        # 构建过滤条件
        filters = {}
        if system_type:
            filters["system_type"] = system_type.upper()

        # 使用 db 工具查询
        result = await self.db.query("system", filters)

        if not result.success:
            return SkillResult(
                success=False,
                message=result.error or "查询失败"
            )

        systems = result.data or []

        if not systems:
            return SkillResult(
                success=True,
                message="暂无评分记录",
                data=[]
            )

        # 格式化输出，添加中文名称
        data = [
            {
                "type": s.get("type"),
                "name": SYSTEM_TYPE_NAMES.get(s.get("type"), s.get("type")),
                "score": s.get("score"),
                "details": s.get("details"),
                "updated_at": s.get("updated_at")
            }
            for s in systems
        ]

        # 按分数排序
        data.sort(key=lambda x: x.get("score", 0), reverse=True)

        return SkillResult(
            success=True,
            message=f"当前评分：{', '.join([f\"{d['name']}: {d['score']}分\" for d in data[:3]])}...",
            data=data,
            risk_level=self.risk_level
        )


@register_skill
class UpdateSystemScoreSkill(BaseSkill):
    """更新系统评分技能"""

    @property
    def name(self) -> str:
        return "update_system_score"

    @property
    def description(self) -> str:
        return "更新指定系统的评分"

    @property
    def risk_level(self) -> RiskLevel:
        return RiskLevel.MEDIUM

    @property
    def parameters(self) -> List[SkillParameter]:
        return [
            SkillParameter(
                name="system_type",
                type="string",
                description="系统类型（如：FUEL、PHYSICAL、INTELLECTUAL等）",
                required=True,
                enum=SYSTEM_TYPE_ENUMS
            ),
            SkillParameter(
                name="score",
                type="integer",
                description="评分（0-100）",
                required=True
            )
        ]

    @property
    def keywords(self) -> List[str]:
        return ["修改评分", "更新评分", "设置评分", "调整评分", "改评分"]

    @property
    def examples(self) -> List[str]:
        return [
            "把运动评分改成 80",
            "更新饮食系统评分为 70",
            "设置工作系统评分 90 分"
        ]

    async def execute(self, **kwargs) -> SkillResult:
        """执行更新评分"""
        system_type = kwargs.get("system_type", "").upper()
        score = kwargs.get("score")

        # 业务逻辑验证
        if score is None:
            return SkillResult(
                success=False,
                message="请提供评分"
            )

        # 验证评分范围
        if not (0 <= score <= 100):
            return SkillResult(
                success=False,
                message="评分必须在 0-100 之间"
            )

        # 验证系统类型
        valid_types = list(SYSTEM_TYPE_NAMES.keys())
        if system_type not in valid_types:
            return SkillResult(
                success=False,
                message=f"无效的系统类型。有效类型: {', '.join(valid_types)}"
            )

        # 先查询当前评分
        query_result = await self.db.query("system", {"system_type": system_type})
        old_score = None
        if query_result.success and query_result.data:
            old_score = query_result.data[0].get("score")

        # 使用 db 工具更新
        result = await self.db.update("system", None, {
            "system_type": system_type,
            "score": score
        })

        if not result.success:
            return SkillResult(
                success=False,
                message=result.error or "更新失败"
            )

        system_name = SYSTEM_TYPE_NAMES.get(system_type, system_type)

        # 构建消息
        if old_score is not None:
            message = f"{system_name}评分已从 {old_score} 分更新为 {score} 分"
        else:
            message = f"已创建{system_name}，评分为 {score} 分"

        return SkillResult(
            success=True,
            message=message,
            data={
                "type": system_type,
                "name": system_name,
                "score": score,
                "old_score": old_score
            },
            risk_level=self.risk_level
        )