import { describe, test, expect, beforeEach } from "bun:test";
import { SessionStateManager } from "./SessionStateManager";

describe("SessionStateManager", () => {
  let manager: SessionStateManager;

  beforeEach(() => {
    manager = new SessionStateManager();
  });

  test("should initialize with empty state", () => {
    expect(manager.getState("session-1")).toBeNull();
  });

  test("should increment idle count", () => {
    manager.incrementIdle("session-1");
    expect(manager.getIdleCount("session-1")).toBe(1);

    manager.incrementIdle("session-1");
    expect(manager.getIdleCount("session-1")).toBe(2);
  });

  test("should reach threshold at 3", () => {
    manager.incrementIdle("session-1");
    manager.incrementIdle("session-1");
    expect(manager.shouldPrompt("session-1")).toBe(false);

    manager.incrementIdle("session-1");
    expect(manager.shouldPrompt("session-1")).toBe(true);
  });

  test("should reset after prompt", () => {
    manager.incrementIdle("session-1");
    manager.incrementIdle("session-1");
    manager.incrementIdle("session-1");
    expect(manager.shouldPrompt("session-1")).toBe(true);

    manager.reset("session-1");
    expect(manager.getIdleCount("session-1")).toBe(0);
    expect(manager.shouldPrompt("session-1")).toBe(false);
  });

  test("should cleanup session state", () => {
    manager.incrementIdle("session-1");
    manager.cleanup("session-1");
    expect(manager.getState("session-1")).toBeNull();
  });
});
