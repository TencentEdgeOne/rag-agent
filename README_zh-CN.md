# RAG Agent

基于 **React + Vite**（前端）和 **OpenAI Agents SDK**（Python 后端）构建的企业级 RAG（检索增强生成）智能体，部署在 **EdgeOne Makers** 上。系统将 PDF 文档处理为本地知识库，并提供带引用溯源的聊天问答界面。

## 部署

[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/makers/new?template=rag-agent&from=within&fromAgent=1&agentLang=python)

## 功能特性

- **RAG 引用溯源** — 回答基于知识库文档，附带来源页码引用
- **流式响应** — 通过 Server-Sent Events (SSE) 实时逐 token 输出
- **工具可视化** — UI 实时展示工具调用过程（搜索、获取页面）
- **会话记忆** — 对话历史通过 EdgeOne `context.store` 持久化
- **停止生成** — 用户可随时中断正在进行的 Agent 运行

## 架构

```
┌─────────────────────────────────────────────────────┐
│  前端 (React 19 + Vite)                              │
│  src/App.tsx → RagChat + KnowledgeBaseSummary       │
│  src/api.ts → SSE 流式客户端                         │
└────────────────────┬────────────────────────────────┘
                     │ SSE / JSON
┌────────────────────▼────────────────────────────────┐
│  后端 (EdgeOne Makers — Python)                      │
│  agents/             — 有状态的 Agent Functions       │
│    chat/index.py        → POST /chat（SSE）          │
│    stop/index.py        → POST /stop                 │
│    rag-stats/index.py   → GET  /rag-stats            │
│  cloud-functions/    — 无状态的 cloud functions       │
│    history/index.py     → POST /history              │
├─────────────────────────────────────────────────────┤
│  核心模块（agents/）                                  │
│  _agent.py  — RAG Agent 定义                         │
│  _tools.py  — search_document、fetch_pages           │
│  _loader.py — 基于文件系统的文档读取器                │
│  _model.py  — LLM 配置（兼容 OpenAI 接口）           │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  知识库 (agents/_data/)                              │
│  由 prepare_rag_data.py 从 PDF 生成                  │
│  {docId}/meta.json + pages/{n}.txt                  │
└─────────────────────────────────────────────────────┘
```

> **为什么后端拆成两个目录？** `agents/` 跑的是有状态、长连接的路由（活跃 SSE 流、按会话维度的 abort 信号）；`cloud-functions/` 跑的是只读 `context.agent.store` 的短小无状态路由。两者拆开之后，历史记录拉取就不会和正在进行的对话争抢同一会话的锁。

## 快速开始

### 前置条件

- Node.js ≥ 18
- Python ≥ 3.10
- OpenAI 兼容的 API Key

### 1. 安装依赖

```bash
# 前端依赖
npm install

# 后端 Python 依赖
pip install -r agents/requirements.txt

# RAG 数据准备工具依赖
pip install -r public/prepare-rag/requirements.txt
```

### 2. 配置环境变量

创建 `agents/.env`：

```env
AI_GATEWAY_API_KEY=your-api-key          # 必填
AI_GATEWAY_BASE_URL=https://your-api-endpoint/v1  # 必填
AI_GATEWAY_MODEL=gpt-4o                  # 选填，默认 gpt-4o
```

### 3. 准备知识库

将 PDF 文件放入 `public/prepare-rag/files/` 目录，然后运行：

```bash
npm run prepare-rag
```

该脚本会从 PDF 中提取文本，并将结构化数据写入 `agents/_data/`。

### 4. 启动开发服务器

```bash
edgeone makers dev
```

## RAG 数据流水线

```
public/prepare-rag/files/*.pdf
        │
        ▼  (prepare_rag_data.py)
agents/_data/
├── index.json                    ← 文档清单
└── {docId}/
    ├── meta.json                 ← 文档元信息
    ├── structure.json (可选)     ← PageIndex 树状索引
    └── pages/
        ├── 1.txt
        ├── 2.txt
        └── ...
```

示例知识库包含：
- **EdgeOne-Pages-Platform-Guide.pdf** — 平台架构、context.store、SSE 流式响应、部署
- **Building-RAG-Applications.pdf** — RAG 模式、检索策略、引用生成、评估指标

## API 接口

| 接口 | 方法 | 所在目录 | 说明 |
|------|------|----------|------|
| `/chat` | POST | `agents/` | 流式 RAG 聊天，使用文档搜索工具 |
| `/stop` | POST | `agents/` | 中止正在运行的 Agent |
| `/rag-stats` | GET | `agents/` | 知识库统计信息 |
| `/history` | POST | `cloud-functions/` | 获取对话历史 |

## SSE 流协议

后端以 `data: {JSON}\n\n` 格式发送事件：

| 事件类型 | 说明 |
|----------|------|
| `start` | 流会话开始 |
| `text-start` | 文本生成开始 |
| `text-delta` | 增量文本 token |
| `text-end` | 文本生成完成 |
| `tool-input-available` | 工具调用发起（UI 可见） |
| `tool-output-available` | 工具返回结果 |
| `finish` | 流完成 |
| `error` | 发生错误 |

## 项目结构

```
rag-agent/
├── src/                          # 前端 (React + Vite)
│   ├── App.tsx                   # 根组件
│   ├── api.ts                    # SSE 流式客户端
│   └── components/
│       ├── RagChat.tsx           # 聊天 UI（流式渲染）
│       ├── CitationCard.tsx      # 引用来源展示
│       └── KnowledgeBaseSummary.tsx
├── agents/                       # 有状态的 EdgeOne Makers Agent Functions
│   ├── _agent.py                 # Agent 定义
│   ├── _tools.py                 # RAG 工具（search_document、fetch_pages）
│   ├── _loader.py                # 文档数据读取器
│   ├── _model.py                 # LLM 配置
│   ├── _data/                    # 生成的知识库数据
│   ├── chat/
│   │   ├── index.py              # POST /chat（SSE 流式）
│   │   └── _stream.py            # 流式处理工具
│   ├── stop/index.py             # POST /stop — 中断正在运行的 agent
│   └── rag-stats/index.py        # GET /rag-stats — 知识库统计
├── cloud-functions/              # 无状态的 EdgeOne Pages Python cloud functions
│   ├── history/index.py          # POST /history — 拉取对话消息
│   └── _logger.py                # 日志工具
├── public/prepare-rag/           # RAG 数据准备
│   ├── prepare_rag_data.py       # PDF → 结构化文本
│   ├── requirements.txt
│   └── files/                    # 源 PDF 文档
├── package.json
├── edgeone.json                  # EdgeOne 部署配置
└── vite.config.ts
```

## 部署

部署到 EdgeOne Makers：

```bash
edgeone makers build
```

`edgeone.json` 配置了 `openai-agents` 框架和 900 秒的 Agent 执行超时。
