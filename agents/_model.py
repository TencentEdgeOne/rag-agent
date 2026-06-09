"""LLM model configuration.

Uses AsyncOpenAI + OpenAIChatCompletionsModel from the OpenAI Agents SDK.
Environment variables: AI_GATEWAY_API_KEY, AI_GATEWAY_BASE_URL, AI_GATEWAY_MODEL
"""

import os
import httpx
from dotenv import load_dotenv
from openai import AsyncOpenAI
from agents import OpenAIChatCompletionsModel
from ._logger import create_logger

load_dotenv()

logger = create_logger("model")

_api_key = os.getenv("AI_GATEWAY_API_KEY", "")
_base_url = os.getenv("AI_GATEWAY_BASE_URL", "")
_model_name = os.getenv("AI_GATEWAY_MODEL", "@makers/deepseek-v4-flash")

if not _api_key or not _base_url:
    logger.error("AI_GATEWAY_API_KEY / AI_GATEWAY_BASE_URL not set")

logger.log(f"Initializing model: {_model_name} @ {_base_url}")

_http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=30.0),
)

llm_client = AsyncOpenAI(
    api_key=_api_key,
    base_url=_base_url,
    http_client=_http_client,
)

llm_model = OpenAIChatCompletionsModel(
    model=_model_name,
    openai_client=llm_client,
)
