# @zhafron/opencode-memory-md

Markdown-based memory plugin for OpenCode with semantic search and git auto-commit.

## Installation

Add to your OpenCode configuration at `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@zhafron/opencode-memory-md"]
}
```

## Features

- **Semantic Search** - Vector embeddings using `nomic-embed-text-v1.5` for semantic similarity search
- **Git Auto-commit** - Automatic commits when session goes idle
- **Session Event Hooks** - Auto-embed memories on session start
- **Context Injection** - Automatic injection into system prompt

## Memory Files

| File | Purpose |
|------|---------|
| `MEMORY.md` | Long-term memory (crucial facts, decisions, preferences) |
| `IDENTITY.md` | AI identity (name, persona, behavioral rules) |
| `USER.md` | User profile (name, preferences, context) |
| `daily/YYYY-MM-DD.md` | Daily logs (day-to-day activities) |
| `BOOTSTRAP.md` | First run setup instructions (deleted after setup) |

## Storage Location

- **macOS/Linux**: `~/.config/opencode/memory/`
- **Windows**: `%APPDATA%/opencode/memory/`

## Tool: memory

**Actions:**

| Action | Description | Parameters |
|--------|-------------|------------|
| `read` | Read memory file | `target`: memory, identity, user, daily |
| `write` | Write to memory file | `target`, `content`, `mode`: append/overwrite |
| `edit` | Edit specific part of file (not daily) | `target`, `oldString`, `newString` |
| `search` | Search memory files (exact + semantic) | `query`, `max_results` (optional) |
| `list` | List all files | - |
| `delete` | Delete a memory file | `target`, `date` (optional for daily) |

**Examples:**

```bash
memory --action read --target memory
memory --action write --target memory --content "Remember to use PostgreSQL for all projects"
memory --action write --target identity --content "- **Name**: Jarvis" --mode overwrite
memory --action write --target daily --content "Fixed critical bug in auth module"
memory --action edit --target memory --oldString "Project: Auth Service" --newString "Project: Payment Service"
memory --action search --query "database configuration"
memory --action list
memory --action delete --target daily --date 2026-02-28
```

## First Run Flow

**Important:** First setup must be done in OpenCode **build mode** (not plan mode). AI cannot write files in plan mode.

1. Plugin detects no MEMORY.md exists
2. Creates BOOTSTRAP.md with setup instructions
3. AI reads BOOTSTRAP.md and asks user questions interactively
4. AI writes to MEMORY.md, IDENTITY.md, USER.md
5. AI deletes BOOTSTRAP.md
6. Setup complete

## Context Injection

MEMORY.md, IDENTITY.md, and USER.md are automatically injected into the system prompt at session start.

Daily logs must be accessed via the `memory` tool.

## Dependencies

- `@huggingface/transformers` - Local embedding model
- `vectra` - Vector database for semantic search

First session will download the embedding model (~70MB) to cache.

## License

MIT
