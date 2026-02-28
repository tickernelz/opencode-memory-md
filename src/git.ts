import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export class GitManager {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  async initialize(): Promise<void> {
    if (fs.existsSync(path.join(this.repoPath, ".git"))) {
      return;
    }

    this.ensureDir(this.repoPath);
    execSync("git init", { cwd: this.repoPath, stdio: "ignore" });
    execSync('git config user.name "OpenCode Memory"', {
      cwd: this.repoPath,
      stdio: "ignore",
    });
    execSync('git config user.email "memory@opencode.local"', {
      cwd: this.repoPath,
      stdio: "ignore",
    });
  }

  async commit(message: string): Promise<boolean> {
    try {
      execSync("git add -A", { cwd: this.repoPath, stdio: "ignore" });
      execSync(`git commit -m "${message}"`, {
        cwd: this.repoPath,
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  }

  async getLog(): Promise<string[]> {
    try {
      const output = execSync("git log --oneline -10", {
        cwd: this.repoPath,
        encoding: "utf-8",
      });
      return output.trim().split("\n");
    } catch {
      return [];
    }
  }

  async hasChanges(): Promise<boolean> {
    try {
      const output = execSync("git status --porcelain", {
        cwd: this.repoPath,
        encoding: "utf-8",
      });
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
