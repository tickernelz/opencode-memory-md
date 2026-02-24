import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";
import { MemoryManager } from "./MemoryManager.js";
import { BootstrapManager } from "./BootstrapManager.js";
import { SessionStateManager } from "./SessionStateManager.js";
import {
  MEMORY_AWARENESS_INSTRUCTIONS,
  BOOTSTRAP_INSTRUCTIONS,
  MEMORY_CHECK_PROMPT,
} from "./memoryInstructions.js";

export const MemoryPlugin: Plugin = async (ctx: PluginInput) => {
  const config = loadConfig();
  const memoryManager = new MemoryManager(config);
  const bootstrapManager = new BootstrapManager(memoryManager);
  const sessionStateManager = new SessionStateManager();

  bootstrapManager.initialize();

  const buildContext = (): string => {
    const sections: string[] = [];
    if (bootstrapManager.isBootstrapNeeded()) {
      const bootstrapContent = memoryManager.readFile(
        memoryManager.getBootstrapPath(),
      );
      if (bootstrapContent?.trim()) {
        sections.push(
          `## BOOTSTRAP.md (First Run Setup)\n\n${bootstrapContent.trim()}`,
        );
      }
    } else {
      const contextFiles = memoryManager.getContextFiles();
      for (const file of contextFiles) {
        sections.push(`## ${file.name}\n\n${file.content}`);
      }
    }
    if (sections.length === 0) return "";
    return `# Memory Context\n\n${sections.join("\n\n---\n\n")}`;
  };

  const getMemoryInstructions = (): string => {
    if (bootstrapManager.isBootstrapNeeded()) {
      return BOOTSTRAP_INSTRUCTIONS;
    }
    return MEMORY_AWARENESS_INSTRUCTIONS;
  };

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const memoryContext = buildContext();
      if (!memoryContext) return;
      const instructions = getMemoryInstructions();
      output.system.push(memoryContext + instructions);
    },

    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const props = event as any;
        const sessionId = props.properties?.sessionID as string | undefined;
        if (!sessionId) return;

        sessionStateManager.incrementIdle(sessionId);

        if (sessionStateManager.shouldPrompt(sessionId)) {
          sessionStateManager.reset(sessionId);

          await ctx.client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [
                {
                  type: "text",
                  text: MEMORY_CHECK_PROMPT(3),
                },
              ],
            },
          });
        }
      }

      if (event.type === "session.deleted") {
        const props = event as any;
        const sessionId = props.properties?.sessionID as string | undefined;
        if (sessionId) {
          sessionStateManager.cleanup(sessionId);
        }
      }
    },

    tool: {
      memory: tool({
        description: [
          "Manage memory files for persistent context across sessions.",
          "",
          "**Actions:**",
          "- `read`: Read a memory file (memory, identity, user, daily, or list all)",
          "- `write`: Write to a memory file (memory, identity, user, daily) with append or overwrite mode",
          "- `search`: Search across all memory files",
          "- `list`: List all memory files",
          "",
          "**Targets:**",
          "- `memory`: MEMORY.md - Long-term memory (crucial facts, decisions, preferences)",
          "- `identity`: IDENTITY.md - AI identity (name, persona, behavioral rules)",
          "- `user`: USER.md - User profile (name, preferences, context)",
          "- `daily`: daily/YYYY-MM-DD.md - Daily logs (day-to-day activities)",
        ].join("\n"),
        args: {
          action: tool.schema
            .enum(["read", "write", "search", "list"])
            .describe("Action to perform"),
          target: tool.schema
            .enum(["memory", "identity", "user", "daily"])
            .optional()
            .describe("Target file: memory, identity, user, or daily"),
          content: tool.schema
            .string()
            .optional()
            .describe("Content to write (for write action)"),
          mode: tool.schema
            .enum(["append", "overwrite"])
            .optional()
            .describe("Write mode (default: append)"),
          date: tool.schema
            .string()
            .optional()
            .describe("Date for daily log (YYYY-MM-DD), defaults to today"),
          query: tool.schema
            .string()
            .optional()
            .describe("Search query (for search action)"),
          max_results: tool.schema
            .number()
            .optional()
            .describe("Max search results (default: 20)"),
        },
        async execute(args) {
          memoryManager.ensureDirectories();

          switch (args.action) {
            case "read":
              return handleRead(args, memoryManager);
            case "write":
              return handleWrite(args, memoryManager);
            case "search":
              return handleSearch(args, memoryManager);
            case "list":
              return handleList(memoryManager);
            default:
              return `Unknown action: ${args.action}`;
          }
        },
      }),
    },
  };
};

function handleRead(
  params: { target?: string; date?: string },
  memoryManager: MemoryManager,
): string {
  const { target, date } = params;

  if (!target) {
    return handleList(memoryManager);
  }

  try {
    const { filePath, displayName } = memoryManager.getPathForTarget(
      target,
      date,
    );
    const content = memoryManager.readFile(filePath);
    if (!content) {
      return `${displayName} not found or empty.`;
    }
    return content;
  } catch (error) {
    return error instanceof Error ? error.message : `Unknown target: ${target}`;
  }
}

function handleWrite(
  params: { target?: string; content?: string; mode?: string; date?: string },
  memoryManager: MemoryManager,
): string {
  const { target, content, mode, date } = params;

  if (!content) {
    return "Error: content is required for write action.";
  }

  if (!target) {
    return "Error: target is required for write action.";
  }

  try {
    const { filePath, displayName } = memoryManager.getPathForTarget(
      target,
      date,
    );

    if (mode === "overwrite") {
      const timestamp = new Date()
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, "");
      memoryManager.writeFile(
        filePath,
        `<!-- last updated: ${timestamp} -->\n${content}`,
      );
    } else {
      memoryManager.appendFile(filePath, content);
    }

    const reflectionPrompt = [
      "",
      "[REFLECTION TRIGGERED]",
      `After writing to ${displayName}, ask yourself:`,
      "1. Why was this update important?",
      "2. What pattern does this reveal about the user or project?",
      "3. Should this trigger additional memory updates (cross-referencing)?",
      "4. How does this connect to previous memories?",
    ].join("\n");

    return `${mode === "overwrite" ? "Wrote to" : "Appended to"} ${displayName}.${reflectionPrompt}`;
  } catch (error) {
    return error instanceof Error ? error.message : `Unknown target: ${target}`;
  }
}

function handleSearch(
  params: { query?: string; max_results?: number },
  memoryManager: MemoryManager,
): string {
  const { query, max_results } = params;

  if (!query) {
    return "Error: query is required for search action.";
  }

  const results = memoryManager.searchFiles(query, max_results ?? 20);

  if (results.length === 0) {
    return `No results for "${query}".`;
  }

  const output = results
    .map((r) => `${r.file}:${r.line}: ${r.text}`)
    .join("\n");
  return `Found ${results.length} results:\n\n${output}`;
}

function handleList(memoryManager: MemoryManager): string {
  const files = memoryManager.listFiles();
  const parts: string[] = [];

  if (files.root.length > 0) {
    parts.push(`Root files:\n${files.root.map((f) => `- ${f}`).join("\n")}`);
  }

  if (files.daily.length > 0) {
    const displayDaily = files.daily.slice(0, 10);
    const more =
      files.daily.length > 10
        ? `\n  ... and ${files.daily.length - 10} more`
        : "";
    parts.push(
      `Daily logs (${files.daily.length}):\n${displayDaily.map((f) => `- daily/${f}`).join("\n")}${more}`,
    );
  }

  if (parts.length === 0) {
    return "No memory files found.";
  }

  return parts.join("\n\n");
}

export default MemoryPlugin;
