import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";
import { MemoryManager } from "./MemoryManager.js";
import { BootstrapManager } from "./BootstrapManager.js";
import { EmbeddingManager } from "./embedding.js";
import { VectorStore } from "./vectorStore.js";
import { GitManager } from "./git.js";
import {
  MEMORY_AWARENESS_INSTRUCTIONS,
  BOOTSTRAP_INSTRUCTIONS,
} from "./memoryInstructions.js";
import * as path from "node:path";
import * as os from "node:os";

export const MemoryPlugin: Plugin = async (ctx: PluginInput) => {
  const config = loadConfig();
  const memoryManager = new MemoryManager(config);
  const bootstrapManager = new BootstrapManager(memoryManager);

  const embeddingCachePath = path.join(
    os.tmpdir(),
    "opencode-memory-embeddings",
  );
  const vectorStorePath = path.join(config.memoryDir, ".vector-store");

  const embeddingManager = new EmbeddingManager(embeddingCachePath);
  const vectorStore = new VectorStore(vectorStorePath);
  vectorStore.setEmbeddingManager(embeddingManager);
  const gitManager = new GitManager(config.memoryDir);

  let initialized = false;

  const initializeEmbeddings = async (): Promise<void> => {
    if (initialized) return;
    try {
      await embeddingManager.initialize();
      await vectorStore.initialize();
      await gitManager.initialize();

      const files = memoryManager.listFiles();
      const allFiles = [...files.root, ...files.daily];

      for (const file of allFiles) {
        const filePath =
          file === "MEMORY.md" || file === "IDENTITY.md" || file === "USER.md"
            ? path.join(config.memoryDir, file)
            : path.join(config.memoryDir, "daily", file);
        const content = memoryManager.readFile(filePath);
        if (content) {
          const embedding = await embeddingManager.embedText(content);
          await vectorStore.upsert(file, content, embedding);
        }
      }
      initialized = true;
    } catch (error) {
      console.error("Failed to initialize embeddings:", error);
    }
  };

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
    event: async ({ event }) => {
      switch (event.type) {
        case "session.created":
          await initializeEmbeddings();
          break;
        case "session.idle":
          const hasChanges = await gitManager.hasChanges();
          if (hasChanges) {
            await gitManager.commit("Auto-save: session idle");
          }
          break;
      }
    },

    "experimental.chat.system.transform": async (_input, output) => {
      const memoryContext = buildContext();
      if (!memoryContext) return;
      const instructions = getMemoryInstructions();
      output.system.push(memoryContext + instructions);
    },

    tool: {
      memory: tool({
        description: [
          "Manage memory files for persistent context across sessions.",
          "",
          "**Actions:**",
          "- `read`: Read a memory file (memory, identity, user, daily, or list all)",
          "- `write`: Write to a memory file (memory, identity, user, daily) with append or overwrite mode",
          "- `edit`: Edit a specific part of memory/identity/user file (not daily). AI must read file first to get exact oldString.",
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
            .enum(["read", "write", "edit", "search", "list"])
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
          oldString: tool.schema
            .string()
            .optional()
            .describe(
              "Text to replace (for edit action). Must read file first to get exact text.",
            ),
          newString: tool.schema
            .string()
            .optional()
            .describe("Replacement text (for edit action)"),
        },
        async execute(args) {
          memoryManager.ensureDirectories();

          switch (args.action) {
            case "read":
              return handleRead(args, memoryManager);
            case "write":
              return handleWrite(
                args,
                memoryManager,
                vectorStore,
                embeddingManager,
              );
            case "edit":
              return handleEdit(args, memoryManager);
            case "search":
              return handleSearch(
                args,
                memoryManager,
                vectorStore,
                embeddingManager,
              );
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

async function handleWrite(
  params: { target?: string; content?: string; mode?: string; date?: string },
  memoryManager: MemoryManager,
  vectorStore: VectorStore,
  embeddingManager: EmbeddingManager,
): Promise<string> {
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

    if (vectorStore.isReady() && embeddingManager.isInitialized()) {
      try {
        const fullContent = memoryManager.readFile(filePath);
        if (fullContent) {
          const embedding = await embeddingManager.embedText(fullContent);
          await vectorStore.upsert(displayName, fullContent, embedding);
        }
      } catch (embedError) {
        console.error("Failed to embed content:", embedError);
      }
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

function handleEdit(
  params: { target?: string; oldString?: string; newString?: string },
  memoryManager: MemoryManager,
): string {
  const { target, oldString, newString } = params;

  if (!target) {
    return "Error: target is required for edit action.";
  }

  if (target === "daily") {
    return "Error: edit action is not supported for daily logs. Use append mode instead.";
  }

  if (!oldString) {
    return "Error: oldString is required for edit action.";
  }

  if (newString === undefined) {
    return "Error: newString is required for edit action.";
  }

  try {
    const { filePath, displayName } = memoryManager.getPathForTarget(target);
    memoryManager.editFile(filePath, oldString, newString);
    return `Edited ${displayName}`;
  } catch (error) {
    return error instanceof Error ? error.message : `Failed to edit ${target}`;
  }
}

async function handleSearch(
  params: { query?: string; max_results?: number },
  memoryManager: MemoryManager,
  vectorStore: VectorStore,
  embeddingManager: EmbeddingManager,
): Promise<string> {
  const { query, max_results } = params;

  if (!query) {
    return "Error: query is required for search action.";
  }

  const exactResults = memoryManager.searchFiles(query, max_results ?? 20);

  let semanticResults: { id: string; text: string; score: number }[] = [];
  if (vectorStore.isReady() && embeddingManager.isInitialized()) {
    try {
      semanticResults = await vectorStore.search(query, max_results ?? 20);
    } catch (error) {
      console.error("Semantic search failed:", error);
    }
  }

  if (exactResults.length === 0 && semanticResults.length === 0) {
    return `No results for "${query}".`;
  }

  const parts: string[] = [];

  if (exactResults.length > 0) {
    parts.push(
      `## Exact Matches (${exactResults.length})\n${exactResults
        .map((r) => `${r.file}:${r.line}: ${r.text}`)
        .join("\n")}`,
    );
  }

  if (semanticResults.length > 0) {
    parts.push(
      `## Semantic Matches (${semanticResults.length})\n${semanticResults
        .map(
          (r) =>
            `[score: ${r.score.toFixed(3)}] ${r.id}: ${r.text.substring(0, 200)}...`,
        )
        .join("\n")}`,
    );
  }

  return `Found results:\n\n${parts.join("\n\n")}`;
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
