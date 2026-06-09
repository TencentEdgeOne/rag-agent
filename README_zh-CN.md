# RAG Agent

**语言：** [English](./README.md) | 简体中文

跑在 EdgeOne Makers 上的检索增强对话 Agent：基于本地 PDF 知识库回答问题，并附带页级引用，全程 SSE 流式返回。后端使用 OpenAI Agents SDK（Python）。

**Framework：** OpenAI Agents SDK · **Category：** File Processing <!-- TODO: confirm --> · **Language：** Python

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=rag-agent&from=within&fromAgent=1&agentLang=python)

<!-- ![preview](./assets/preview.png)  TODO: confirm -->

## 概述

一个完整能跑的企业 RAG 模板：把 PDF 丢进 `public/prepare-rag/files/`，跑一条命令构建知识库，Agent 就能基于这些资料回答问题并给出页级引用。检索层是一个文件系统加载器 —— 没有向量库、没有额外服务要运维 —— 模板因此保持可读。把 loader 换成你自己的检索实现，整套流水线照常工作。

- **带引用的回答** —— 每条结论都通过 `search_document` 与 `fetch_pages` 工具回链到具体文档与页码。
- **流式 + 工具可视化** —— UI 实时渲染 `tool-input-available` / `tool-output-available` 事件，让用户看到 Agent 正在读哪些来源。
- **文件系统知识库** —— `prepare_rag_data.py` 把 PDF 抽取为 `agents/_data/{docId}/pages/{n}.txt`；`_loader.py` 在请求时按需读取，且做路径穿越保护。
- **会话粘性记忆** —— `context.store.openai_session(conversation_id)` 保留多轮上下文；无状态的 `/history` cloud function 用于刷新页面后恢复对话。
- **可信中断** —— `/stop` 通过 `context.utils.abort_active_run()` 真正中断正在进行的 LLM 调用。

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_GATEWAY_API_KEY` | 是 | 模型网关 API Key。可填 Makers Models 的 API Key，也可以是任意 OpenAI 兼容服务商的 Key。 |
| `AI_GATEWAY_BASE_URL` | 是 | 网关 Base URL。Makers Models 请使用 `https://ai-gateway.edgeone.link/v1`。 |
| `AI_GATEWAY_MODEL` | 否 | 模型 ID。默认 `@makers/deepseek-v4-flash`（内置免费模型）。 |

模板遵循 OpenAI 兼容协议，可以指向 Makers Models，也可以指向任意 OpenAI 兼容的服务商。

### 如何获取 `AI_GATEWAY_API_KEY`

1. 打开 [Makers 控制台](https://console.cloud.tencent.com/edgeone/makers)。
2. 登录并开通 Makers。
3. 进入 **Makers → Models → API Key**，新建一个 Key。
4. 把它粘到 `AI_GATEWAY_API_KEY`。

内置的 `@makers/deepseek-v4-flash` 免费但有用量限制，适合验证；生产建议自行绑定付费厂商（BYOK）。

## 本地开发

前置依赖：Node.js ≥ 18、Python ≥ 3.10，以及 EdgeOne CLI（`npm i -g edgeone`）。

```bash
npm install
pip install -r agents/requirements.txt
pip install -r public/prepare-rag/requirements.txt
cp .env.example .env       # 然后填入 AI_GATEWAY_API_KEY / AI_GATEWAY_BASE_URL

# 把 PDF 放到 public/prepare-rag/files/，再构建知识库
npm run prepare-rag

edgeone makers dev
```

本地观测面板：`http://localhost:8080/agent-metrics`。

## 项目结构

```text
rag-agent/
├── agents/                          # 有状态的 EdgeOne Makers Agent Functions（Python）
│   ├── chat/index.py               # POST /chat —— 流式 RAG 聊天
│   ├── chat/_stream.py             # SSE 流式工具（私有）
│   ├── stop/index.py               # POST /stop —— 中断当前 agent
│   ├── rag-stats/index.py          # POST /rag-stats —— 知识库统计
│   ├── _agent.py                   # RAG Agent 定义（私有）
│   ├── _tools.py                   # search_document、fetch_pages 工具（私有）
│   ├── _loader.py                  # 文件系统知识库读取（私有）
│   ├── _model.py                   # LLM 配置（私有）
│   ├── _data/                      # 生成的知识库（gitignore）
│   └── requirements.txt            # Python agent 依赖
├── cloud-functions/                 # 无状态的 EdgeOne Pages Python cloud functions
│   ├── history/index.py            # POST /history —— 拉取对话消息
│   └── _logger.py                  # 日志工具
├── public/prepare-rag/              # PDF → 结构化文本流水线
│   ├── prepare_rag_data.py
│   ├── requirements.txt
│   └── files/                      # 在这里放置源 PDF
├── src/                             # React + Vite 前端
│   ├── App.tsx                     # 根组件
│   ├── api.ts                      # SSE 流客户端
│   └── components/
│       ├── RagChat.tsx             # 流式 + 工具可视化的对话 UI
│       ├── CitationCard.tsx        # 来源引用展示
│       └── KnowledgeBaseSummary.tsx
├── package.json
├── edgeone.json                     # framework=openai-sdk，agents.timeout=300，sandbox.timeout=300
└── vite.config.ts
```

> 以 `_` 开头的文件是私有模块，不会暴露为公开路由。

## 工作原理（How It Works）

`agents/` 跑的是**会话模式**：携带相同 `Markers-Conversation-Id` HTTP Header 的请求会粘性路由到同一个 Agent 实例，共享同一份内存状态与同一个 EdgeOne 沙箱。这种粘性正是 `/chat`（SSE 流）与 `/stop`（中断）能命中同一个正在跑的任务的前提。注意 `/stop` 的会话 ID 走的是 body 而不是 header，避免与活跃 SSE 流的 cancel 信号撞车。

端到端流程：

1. **构建知识库（离线）**：`prepare_rag_data.py` 从 `public/prepare-rag/files/` 读 PDF，输出 `agents/_data/{docId}/meta.json` + `pages/{n}.txt`（可选 `structure.json` 页面树）。`agents/_data/index.json` 是文档清单。
2. **请求入口**：`POST /chat`（由 `agents/chat/index.py` 处理）通过 `context.store.openai_session(conversation_id)` 拉取历史，并启动 `_agent.py` 中定义的 OpenAI Agents SDK Agent。
3. **LLM ↔ 工具循环**：Agent 拥有 `_tools.py` 中定义的两个工具：
   - `search_document(query)` —— 从本地知识库检索候选页
   - `fetch_pages(doc_id, pages)` —— 精确读取页文本用于引用
   最多 6 轮；`_loader.py` 强制在 `Path(__file__).parent / "_data"` 范围内做路径穿越保护。
4. **流式输出**：handler 推送 SSE 事件 `start`、`text-start`、`text-delta`、`text-end`、`tool-input-available`、`tool-output-available`、`finish`、`error`，前端 `useAgentStream` reducer 将其转成对话气泡 + 引用卡片。
5. **统计 / 历史 / 中断**：`POST /rag-stats`（在 `agents/`）返回知识库元信息；`POST /history`（在 `cloud-functions/`）走 `context.agent.store.get_messages()` 用于刷新后恢复；`POST /stop` 取消当前 run。

沙箱凭证由运行时自动注入，无需本地配置。`edgeone.json` 中 `agents.timeout` 与 `agents.sandbox.timeout` 均为 300 秒。

内置的示例知识库：

- **EdgeOne-Pages-Platform-Guide.pdf** —— 平台架构、`context.store`、SSE 流、部署。
- **Building-RAG-Applications.pdf** —— RAG 模式、检索策略、引用、评测。

## 资源

- [EdgeOne Makers Agents 文档](https://pages.edgeone.ai/document/agents)
- [EdgeOne Makers 快速开始](https://pages.edgeone.ai/document/agents-quickstart)
- [Makers Models](https://pages.edgeone.ai/document/models)

## License

MIT.
