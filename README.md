# RAG Agent

**Language:** English | [简体中文](./README_zh-CN.md)

A retrieval-augmented chat agent on EdgeOne Makers — answers questions over a local PDF knowledge base with citation-backed responses, streamed over SSE. Backend uses the OpenAI Agents SDK (Python).

**Framework:** OpenAI Agents SDK · **Category:** File Processing <!-- TODO: confirm --> · **Language:** Python

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=rag-agent&from=within&fromAgent=1&agentLang=python)

<!-- ![preview](./assets/preview.png)  TODO: confirm -->

## Overview

A working enterprise-style RAG template: drop PDFs into `public/prepare-rag/files/`, run one script, and the agent answers grounded questions with page-level citations. The retrieval layer is a small filesystem-backed loader — no vector DB, no extra service to operate — so the template stays readable. Replace the loader with your own retrieval and the rest of the pipeline keeps working.

- **Citation-backed answers** — every claim links back to a specific document + page via `search_document` and `fetch_pages` tools.
- **Streaming + tool visibility** — the UI surfaces `tool-input-available` / `tool-output-available` events so users see which sources the agent reads, in real time.
- **Filesystem knowledge base** — `prepare_rag_data.py` extracts PDFs into `agents/_data/{docId}/pages/{n}.txt`; `_loader.py` reads them at request time, path-traversal-safe.
- **Sticky session memory** — `context.store.openai_session(conversation_id)` keeps multi-turn context within a conversation; the stateless `/history` cloud function rehydrates the chat after a refresh.
- **Honest stop** — `/stop` calls `context.utils.abort_active_run()` to interrupt the LLM call mid-stream.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | Model gateway API key. Use your Makers Models API Key, or any OpenAI-compatible provider key. |
| `AI_GATEWAY_BASE_URL` | Yes | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`. |
| `AI_GATEWAY_MODEL` | No | Model ID. Defaults to `@makers/deepseek-v4-flash` (a free built-in model). |

This template follows the OpenAI-compatible standard — point these at Makers Models or any compatible provider.

### How to get `AI_GATEWAY_API_KEY`

1. Open the [Makers Console](https://console.cloud.tencent.com/edgeone/makers).
2. Sign in and enable Makers.
3. Go to **Makers → Models → API Key** and create a key.
4. Copy it into `AI_GATEWAY_API_KEY`.

The built-in `@makers/deepseek-v4-flash` model is free with a usage cap and is suitable for prototyping. For production, bind your own paid provider (BYOK).

## Local Development

Prerequisites: Node.js ≥ 18, Python ≥ 3.10, and the EdgeOne CLI (`npm i -g edgeone`).

```bash
npm install
pip install -r agents/requirements.txt
pip install -r public/prepare-rag/requirements.txt
cp .env.example .env       # then fill in AI_GATEWAY_API_KEY / AI_GATEWAY_BASE_URL

# Drop PDFs into public/prepare-rag/files/, then build the knowledge base
npm run prepare-rag

edgeone makers dev
```

Local agent metrics & traces are exposed at `http://localhost:8080/agent-metrics`.

## Project Structure

```text
rag-agent/
├── agents/                          # Stateful EdgeOne Makers Agent Functions (Python)
│   ├── chat/index.py               # POST /chat — streaming RAG chat
│   ├── chat/_stream.py             # SSE streaming utilities (private)
│   ├── stop/index.py               # POST /stop — abort active agent run
│   ├── rag-stats/index.py          # POST /rag-stats — knowledge base stats
│   ├── _agent.py                   # RAG Agent definition (private)
│   ├── _tools.py                   # search_document, fetch_pages tools (private)
│   ├── _loader.py                  # Filesystem knowledge base reader (private)
│   ├── _model.py                   # LLM configuration (private)
│   ├── _data/                      # Generated knowledge base (gitignored)
│   └── requirements.txt            # Python agent dependencies
├── cloud-functions/                 # Stateless EdgeOne Pages Python cloud functions
│   ├── history/index.py            # POST /history — load conversation messages
│   └── _logger.py                  # Logger utility
├── public/prepare-rag/              # PDF → structured text pipeline
│   ├── prepare_rag_data.py
│   ├── requirements.txt
│   └── files/                      # Drop your source PDFs here
├── src/                             # React + Vite frontend
│   ├── App.tsx                     # Root component
│   ├── api.ts                      # SSE stream client
│   └── components/
│       ├── RagChat.tsx             # Chat UI with streaming + tool visibility
│       ├── CitationCard.tsx        # Source citation display
│       └── KnowledgeBaseSummary.tsx
├── package.json
├── edgeone.json                     # framework=openai-sdk, agents.timeout=300, sandbox.timeout=300
└── vite.config.ts
```

> Files prefixed with `_` are private modules — not exposed as public routes.

## How It Works

`agents/` runs in **conversation mode**: requests carrying the same `Markers-Conversation-Id` HTTP header are sticky-routed to the same agent instance, sharing the same in-memory state and the same EdgeOne sandbox. That stickiness is what lets `/chat` (the SSE stream) and `/stop` (the abort) reach the same running task. `/stop` deliberately receives the conversation id in the request body — never in the header — so the cancel signal doesn't collide with the live SSE stream.

End-to-end:

1. **Build the knowledge base (offline)** — `prepare_rag_data.py` reads PDFs from `public/prepare-rag/files/` and writes `agents/_data/{docId}/meta.json` + `pages/{n}.txt` (plus an optional `structure.json` page-tree). `agents/_data/index.json` is the document manifest.
2. **Request entry** — `POST /chat` (handled by `agents/chat/index.py`) pulls history via `context.store.openai_session(conversation_id)` and starts an OpenAI Agents SDK run for the `_agent.py` agent definition.
3. **LLM ↔ tools loop** — the agent has access to two tools defined in `_tools.py`:
   - `search_document(query)` — retrieves candidate pages from the local knowledge base
   - `fetch_pages(doc_id, pages)` — reads exact page text for citation
   The agent runs up to 6 turns; `_loader.py` enforces path-traversal-safe filesystem reads under `Path(__file__).parent / "_data"`.
4. **Streaming** — the handler emits SSE events `start`, `text-start`, `text-delta`, `text-end`, `tool-input-available`, `tool-output-available`, `finish`, `error`. The UI's `useAgentStream` reducer turns those into chat bubbles + citation cards.
5. **Stats / history / stop** — `POST /rag-stats` (in `agents/`) returns knowledge-base metadata; `POST /history` (in `cloud-functions/`) reads `context.agent.store.get_messages()` to rehydrate after a refresh; `POST /stop` cancels the live run.

Sandbox credentials are injected by the runtime — no local sandbox config is needed. Per `edgeone.json`, both the agent and its sandbox have a 300-second timeout (`agents.timeout`, `agents.sandbox.timeout`).

The bundled sample knowledge base includes:

- **EdgeOne-Pages-Platform-Guide.pdf** — platform architecture, `context.store`, SSE streaming, deployment.
- **Building-RAG-Applications.pdf** — RAG patterns, retrieval strategies, citations, evaluation.

## Resources

- [EdgeOne Makers Agents — Documentation](https://pages.edgeone.ai/document/agents)
- [EdgeOne Makers — Quick Start](https://pages.edgeone.ai/document/agents-quickstart)
- [Makers Models](https://pages.edgeone.ai/document/models)

## License

MIT.
