import { LocalIndex } from "vectra";
import { EmbeddingManager } from "./embedding";

export interface SearchResult {
  id: string;
  text: string;
  score: number;
}

export class VectorStore {
  private store: LocalIndex;
  private embeddingManager: EmbeddingManager | null = null;
  private ready = false;

  constructor(vectorStorePath: string) {
    this.store = new LocalIndex(vectorStorePath);
  }

  setEmbeddingManager(embeddingManager: EmbeddingManager): void {
    this.embeddingManager = embeddingManager;
  }

  async initialize(): Promise<void> {
    if (!(await this.store.isIndexCreated())) {
      await this.store.createIndex({ version: 1 });
    }
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async upsert(id: string, text: string, embedding: number[]): Promise<void> {
    await this.store.upsertItem({
      id,
      vector: embedding,
      metadata: {
        text,
        createdAt: Date.now(),
      },
    });
  }

  async search(query: string, topK: number): Promise<SearchResult[]> {
    if (!this.embeddingManager) {
      throw new Error("EmbeddingManager not set");
    }

    const queryEmbedding = await this.embeddingManager.embedText(query);
    const results = await this.store.queryItems(queryEmbedding, topK);

    return results.map((r) => ({
      id: r.item.id,
      text: (r.item.metadata?.text as string) ?? "",
      score: r.score,
    }));
  }

  async delete(id: string): Promise<void> {
    await this.store.deleteItem(id);
  }

  async listAll(): Promise<{ id: string; text: string }[]> {
    const items = await this.store.listItems();
    return items.map((item) => ({
      id: item.id,
      text: (item.metadata?.text as string) ?? "",
    }));
  }
}
