# RAG Agent

An enterprise RAG (Retrieval-Augmented Generation) agent built with **React + Vite** (frontend) and **OpenAI Agents SDK** (Python backend) on **EdgeOne Makers**. The system processes PDF documents into a local knowledge base and provides a chat interface with citation-backed answers.

## Deploy

[![Deploy with EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=rag-agent&from=within&fromAgent=1&agentLang=python)

## Features

- **RAG with Citations** — Answers grounded in knowledge base documents with source page references
- **Streaming Responses** — Real-time token streaming via Server-Sent Events (SSE)
- **Tool Visibility** — UI displays tool calls (search, fetch) as they happen
- **Session Memory** — Conversation history persisted via EdgeOne `context.store`
- **Stop Generation** — Users can abort ongoing agent runs mid-stream

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React 19 + Vite)                         │
│  src/App.tsx → RagChat + KnowledgeBaseSummary       │
│  src/api.ts → SSE stream client                     │
└────────────────────┬────────────────────────────────┘
                     │ SSE / JSON
┌────────────────────▼────────────────────────────────┐
│  Backend (EdgeOne Makers — Python)          │
│  agents/chat/index.py        → POST /chat           │
│  agents/stop/index.py        → POST /stop           │
│  agents/history/index.py     → POST /history        │
│  agents/rag-stats/index.py   → GET  /rag-stats      │
├─────────────────────────────────────────────────────┤
│  Core Modules                                       │
│  _agent.py  — RAG Agent definition                  │
│  _tools.py  — search_document, fetch_pages, etc.    │
│  _loader.py — Filesystem-based document reader      │
│  _model.py  — LLM configuration (OpenAI-compatible) │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  Knowledge Base (agents/_data/)                      │
│  Generated from PDFs by prepare_rag_data.py         │
│  {docId}/meta.json + pages/{n}.txt                  │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js ≥ 18
- Python ≥ 3.10
- An OpenAI-compatible API key

### 1. Install Dependencies

```bash
# Frontend
npm install

# Backend Python dependencies
pip install -r agents/requirements.txt

# RAG data preparation tool
pip install -r public/prepare-rag/requirements.txt
```

### 2. Configure Environment Variables

Create `agents/.env`:

```env
AI_GATEWAY_API_KEY=your-api-key          # Required
AI_GATEWAY_BASE_URL=https://your-api-endpoint/v1  # Required
AI_GATEWAY_MODEL=gpt-4o                  # Optional, defaults to gpt-4o
```

### 3. Prepare Knowledge Base

Place PDF files in `public/prepare-rag/files/`, then run:

```bash
npm run prepare-rag
```

This extracts text from PDFs and writes structured data to `agents/_data/`.

### 4. Run Development Servers

```bash
edgeone makers dev
```

## RAG Data Pipeline

```
public/prepare-rag/files/*.pdf
        │
        ▼  (prepare_rag_data.py)
agents/_data/
├── index.json                    ← Document manifest
└── {docId}/
    ├── meta.json                 ← Document metadata
    ├── structure.json (optional) ← PageIndex tree
    └── pages/
        ├── 1.txt
        ├── 2.txt
        └── ...
```

The sample knowledge base includes:
- **EdgeOne-Pages-Platform-Guide.pdf** — Platform architecture, context.store, SSE streaming, deployment
- **Building-RAG-Applications.pdf** — RAG patterns, retrieval strategies, citations, evaluation

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | POST | Streaming RAG chat with document search tools |
| `/stop` | POST | Abort active agent run |
| `/history` | POST | Retrieve conversation history |
| `/rag-stats` | GET | Knowledge base statistics |

## SSE Stream Protocol

The backend emits events in the format `data: {JSON}\n\n`:

| Event Type | Description |
|------------|-------------|
| `start` | Stream session started |
| `text-start` | Beginning of text generation |
| `text-delta` | Incremental text token |
| `text-end` | Text generation complete |
| `tool-input-available` | Tool call initiated (shows in UI) |
| `tool-output-available` | Tool result returned |
| `finish` | Stream complete |
| `error` | Error occurred |

## Project Structure

```
rag-agent/
├── src/                          # Frontend (React + Vite)
│   ├── App.tsx                   # Root component
│   ├── api.ts                    # SSE stream client
│   └── components/
│       ├── RagChat.tsx           # Chat UI with streaming
│       ├── CitationCard.tsx      # Source citation display
│       └── KnowledgeBaseSummary.tsx
├── agents/                       # Backend (EdgeOne Makers)
│   ├── _agent.py                 # Agent definition
│   ├── _tools.py                 # RAG tools (search, fetch)
│   ├── _loader.py                # Document data reader
│   ├── _model.py                 # LLM configuration
│   ├── _data/                    # Generated knowledge base
│   ├── chat/
│   │   ├── index.py              # POST /chat endpoint
│   │   └── _stream.py            # Streaming utilities
│   ├── stop/index.py             # Stop generation endpoint
│   ├── history/index.py          # History endpoint
│   └── rag-stats/index.py        # Stats endpoint
├── public/prepare-rag/           # RAG data preparation
│   ├── prepare_rag_data.py       # PDF → structured text
│   ├── requirements.txt
│   └── files/                    # Source PDF documents
├── package.json
├── edgeone.json                  # EdgeOne deployment config
└── vite.config.ts
```

## Deployment

Deploy to EdgeOne Makers:

```bash
edgeone makers build
```

The `edgeone.json` configures the deployment with `openai-agents` framework and 900s timeout for agent execution.
