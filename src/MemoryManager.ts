import * as path from "node:path";
import * as fs from "node:fs";
import type {
  MemoryConfig,
  SearchResult,
  ListResult,
  ContextFile,
} from "./types.js";
import { ensureDir } from "./config.js";

export class MemoryManager {
  private config: MemoryConfig;
  private dailyDir: string;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.dailyDir = path.join(config.memoryDir, "daily");
  }

  ensureDirectories(): void {
    ensureDir(this.config.memoryDir);
    ensureDir(this.dailyDir);
  }

  getMemoryPath(): string {
    return path.join(this.config.memoryDir, "MEMORY.md");
  }

  getIdentityPath(): string {
    return path.join(this.config.memoryDir, "IDENTITY.md");
  }

  getUserPath(): string {
    return path.join(this.config.memoryDir, "USER.md");
  }

  getBootstrapPath(): string {
    return path.join(this.config.memoryDir, "BOOTSTRAP.md");
  }

  getDailyPath(date: string): string {
    return path.join(this.dailyDir, `${date}.md`);
  }

  todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  readFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  writeFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, "utf-8");
  }

  appendFile(filePath: string, content: string): void {
    const existing = this.readFile(filePath);
    const separator = existing?.trim() ? "\n\n" : "";
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, "");
    const stamped = `<!-- ${timestamp} -->\n${content}`;
    fs.writeFileSync(filePath, (existing ?? "") + separator + stamped, "utf-8");
  }

  deleteFile(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  isInitialized(): boolean {
    return this.fileExists(this.getMemoryPath());
  }

  needsBootstrap(): boolean {
    return this.fileExists(this.getBootstrapPath());
  }

  getContextFiles(): ContextFile[] {
    const files: ContextFile[] = [];
    const memoryContent = this.readFile(this.getMemoryPath());
    if (memoryContent?.trim()) {
      files.push({ name: "MEMORY.md", content: memoryContent.trim() });
    }
    const identityContent = this.readFile(this.getIdentityPath());
    if (identityContent?.trim()) {
      files.push({ name: "IDENTITY.md", content: identityContent.trim() });
    }
    const userContent = this.readFile(this.getUserPath());
    if (userContent?.trim()) {
      files.push({ name: "USER.md", content: userContent.trim() });
    }
    return files;
  }

  searchFiles(query: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const needle = query.toLowerCase();
    const searchPaths = [
      { dir: this.config.memoryDir, prefix: "" },
      { dir: this.dailyDir, prefix: "daily" },
    ];

    for (const { dir, prefix } of searchPaths) {
      try {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
        for (const file of files) {
          if (file === "BOOTSTRAP.md") continue;
          if (results.length >= maxResults) break;
          const filePath = path.join(dir, file);
          const content = this.readFile(filePath);
          if (!content) continue;
          const lines = content.split("\n");
          for (
            let i = 0;
            i < lines.length && results.length < maxResults;
            i++
          ) {
            if (lines[i].toLowerCase().includes(needle)) {
              results.push({
                file: prefix ? `${prefix}/${file}` : file,
                line: i + 1,
                text: lines[i].trimEnd(),
              });
            }
          }
        }
      } catch {}
    }
    return results;
  }

  listFiles(): ListResult {
    const root: string[] = [];
    const daily: string[] = [];

    try {
      const rootFiles = fs
        .readdirSync(this.config.memoryDir)
        .filter((f) => f.endsWith(".md"))
        .sort();
      for (const f of rootFiles) {
        if (f !== "BOOTSTRAP.md") root.push(f);
      }
    } catch {}

    try {
      const dailyFiles = fs
        .readdirSync(this.dailyDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse();
      daily.push(...dailyFiles);
    } catch {}

    return { root, daily };
  }
}
