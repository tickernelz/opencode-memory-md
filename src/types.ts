export interface MemoryConfig {
  memoryDir: string;
}

export const DEFAULT_CONFIG: MemoryConfig = {
  memoryDir: "",
};

export type MemoryTarget = "memory" | "identity" | "user" | "daily";
export type WriteMode = "append" | "overwrite";
export type MemoryAction = "read" | "write" | "search" | "list";

export interface SearchResult {
  file: string;
  line: number;
  text: string;
}

export interface ListResult {
  root: string[];
  daily: string[];
}

export interface ContextFile {
  name: string;
  content: string;
}
