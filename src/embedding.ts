import { pipeline, env } from "@huggingface/transformers";
import * as path from "path";
import * as fs from "fs";

env.allowLocalModels = false;
env.useBrowserCache = true;

export class EmbeddingManager {
  private embedder: any = null;
  private initialized = false;
  private modelCachePath: string;

  constructor(modelCachePath: string) {
    this.modelCachePath = modelCachePath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.ensureCacheDir();

    this.embedder = await pipeline(
      "feature-extraction",
      "Xenova/nomic-embed-text-v1.5",
      { dtype: "q4" },
    );
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error("EmbeddingManager not initialized");
    }

    const output = await this.embedder(text, {
      pooling: "mean",
      normalize: true,
    });

    return Array.from(output.data);
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.modelCachePath)) {
      fs.mkdirSync(this.modelCachePath, { recursive: true });
    }
  }
}
