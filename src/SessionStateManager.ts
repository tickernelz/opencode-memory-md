import { SessionState } from "./types.js";

const IDLE_THRESHOLD = 3;

export class SessionStateManager {
  private sessions: Map<string, SessionState> = new Map();

  getSessionState(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getState(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  incrementIdle(sessionId: string): number {
    const state = this.sessions.get(sessionId) ?? { idleCount: 0 };
    state.idleCount += 1;
    this.sessions.set(sessionId, state);
    return state.idleCount;
  }

  getIdleCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.idleCount ?? 0;
  }

  shouldPrompt(sessionId: string): boolean {
    const count = this.getIdleCount(sessionId);
    return count >= IDLE_THRESHOLD;
  }

  reset(sessionId: string): void {
    this.sessions.set(sessionId, { idleCount: 0 });
  }

  cleanup(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  cleanupAll(): void {
    this.sessions.clear();
  }
}
