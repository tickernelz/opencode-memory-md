# @zhafron/opencode-memory-md

Simple markdown-based memory plugin for OpenCode.

## Installation

Add to your OpenCode configuration at `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@zhafron/opencode-memory-md"]
}
```

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
| `search` | Search memory files | `query`, `max_results` (optional) |
| `list` | List all files | - |

**Examples:**

```bash
memory --action read --target memory
memory --action write --target memory --content "Remember to use PostgreSQL for all projects"
memory --action write --target identity --content "- **Name**: Jarvis" --mode overwrite
memory --action write --target daily --content "Fixed critical bug in auth module"
memory --action search --query "PostgreSQL"
memory --action list
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

## License

MIT
