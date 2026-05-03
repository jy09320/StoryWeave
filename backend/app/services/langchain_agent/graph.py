"""LangGraph ReAct graph for conversational project asset agent."""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import SystemMessage
from langgraph.graph import END, StateGraph, MessagesState
from langgraph.prebuilt import ToolNode

logger = logging.getLogger(__name__)

_WORLD_SYSTEM = (
    "你是专业的小说世界观设定助手，当前项目已加载。\n"
    "你的职责：\n"
    "1. 与用户自然对话，主动引导用户完善世界观（背景、规则、势力、地点、时间线等）。\n"
    "2. 当用户提供资料或明确要求更新设定时，调用 draft_world_setting_update 生成建议。\n"
    "3. 当需要了解现有世界观内容时，调用 query_world_setting。\n"
    "4. 当需要了解项目角色时，调用 query_characters。\n"
    "5. draft_* 工具只生成建议，不直接写入数据库。调用完成后，告知用户建议已生成，"
    "请点击界面下方的【应用写入】按钮确认写入，不要在对话中询问用户是否确认，也不要等待用户输入确认。\n"
    "6. 对话语言使用中文，风格专业、简洁、富有创意。\n"
    "7. 如果用户只是闲聊或询问问题而不需要生成建议，直接自然回复即可，无需调用工具。\n"
    "8. 如果用户发送【确认】【写入】【应用】等字样，说明他们可能在找按钮，请提示他们点击下方【应用写入】按钮，不要重复调用工具。"
)

_CHARACTER_SYSTEM = (
    "你是专业的小说角色管理助手，当前项目已加载。\n"
    "你的职责：\n"
    "1. 与用户自然对话，主动引导用户完善角色设定（外貌、性格、背景、关系等）。\n"
    "2. 当用户提供角色资料或明确要求创建/更新角色时，调用 draft_character_actions 生成建议。\n"
    "3. 当需要了解项目现有角色时，调用 query_characters。\n"
    "4. 当需要了解世界观背景时，调用 query_world_setting。\n"
    "5. draft_* 工具只生成建议，不直接写入数据库。调用完成后，告知用户建议已生成，"
    "请点击界面下方的【应用写入】按钮确认写入，不要在对话中询问用户是否确认，也不要等待用户输入确认。\n"
    "6. 对话语言使用中文，风格专业、简洁、富有创意。\n"
    "7. 如果用户只是闲聊或询问问题而不需要生成建议，直接自然回复即可，无需调用工具。\n"
    "8. 如果用户发送【确认】【写入】【应用】等字样，说明他们可能在找按钮，请提示他们点击下方【应用写入】按钮，不要重复调用工具。"
)


def build_graph(asset_type: str, tools: list[Any], llm: Any):
    """Build and compile a ReAct graph for the given asset type."""
    system_prompt = _WORLD_SYSTEM if asset_type == "world_setting" else _CHARACTER_SYSTEM
    model_with_tools = llm.bind_tools(tools)
    tool_node = ToolNode(tools)

    def agent_node(state: MessagesState):
        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        response = model_with_tools.invoke(messages)
        return {"messages": [response]}

    def should_continue(state: MessagesState):
        last_message = state["messages"][-1]
        if getattr(last_message, "tool_calls", None):
            return "tools"
        return END

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile()
