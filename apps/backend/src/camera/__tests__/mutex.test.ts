/**
 * Capture Mutex Tests
 * 
 * Tests the CaptureMutex class which ensures thread-safe camera operations
 * by serializing capture requests. Critical for preventing race conditions
 * in multi-user scenarios.
 * 
 * Source: apps/backend/src/camera/mutex.ts
 * 
 * Critical Invariants:
 * - Only one capture can execute at a time
 * - In 'reject' mode, busy captures throw CamerasBusyError
 * - In 'queue' mode, one capture can wait, subsequent ones are rejected
 * - Queue depth never exceeds 1
 * - Lock must be released in finally block regardless of operation success/failure
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaptureMutex } from "../mutex";
import { CamerasBusyError } from "../errors";

describe("CaptureMutex", () => {
  let mutex: CaptureMutex;

  beforeEach(() => {
    mutex = new CaptureMutex("reject");
  });

  describe("acquire() in 'reject' mode", () => {
    it("resolves immediately when unlocked", async () => {
      const operation = vi.fn().mockResolvedValue("result");
      
      const result = await mutex.acquire(operation, {
        sessionId: "test-session",
        operation: "capture",
      });

      expect(result).toBe("result");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("throws CamerasBusyError when locked", async () => {
      // First acquire holds the lock
      const longOperation = vi.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 1000))
      );
      
      // Start the long operation (don't await)
      mutex.acquire(longOperation, {
        sessionId: "session-1",
        operation: "capture",
      });

      // Try to acquire while locked
      const secondOperation = vi.fn().mockResolvedValue("result2");
      
      await expect(
        mutex.acquire(secondOperation, {
          sessionId: "session-2",
          operation: "capture",
        })
      ).rejects.toThrow(CamerasBusyError);

      expect(secondOperation).not.toHaveBeenCalled();
    });

    it("release() fires in finally block when operation throws", async () => {
      const error = new Error("Operation failed");
      const operation = vi.fn().mockRejectedValue(error);
      
      await expect(
        mutex.acquire(operation, {
          sessionId: "test-session",
          operation: "capture",
        })
      ).rejects.toThrow("Operation failed");

      // Lock should be released even though operation threw
      expect(mutex.isLocked()).toBe(false);
    });

    it("only allows one operation to succeed with 5 concurrent calls", async () => {
      const results: (string | Error)[] = [];
      const operation = vi.fn().mockImplementation((id: number) => 
        new Promise((resolve) => setTimeout(() => resolve(`success-${id}`), 50))
      );

      // Start 5 concurrent acquire attempts
      const promises = Array.from({ length: 5 }, (_, i) =>
        mutex
          .acquire(() => operation(i), {
            sessionId: `session-${i}`,
            operation: "capture",
          })
          .then((result) => results.push(result as string))
          .catch((err) => results.push(err))
      );

      await Promise.all(promises);

      // First one should succeed, others should get CamerasBusyError
      const successes = results.filter((r) => typeof r === "string" && r.startsWith("success-"));
      const errors = results.filter((r) => r instanceof CamerasBusyError);

      expect(successes).toHaveLength(1);
      expect(errors).toHaveLength(4);
    });
  });

  describe("acquire() in 'queue' mode", () => {
    beforeEach(() => {
      mutex.setMode("queue");
    });

    it("waits and resolves when lock releases", async () => {
      const firstOperation = vi.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve("first-result"), 50))
      );

      const secondOperation = vi.fn().mockResolvedValue("second-result");

      // Start first operation
      const firstPromise = mutex.acquire(firstOperation, {
        sessionId: "session-1",
        operation: "capture",
      });

      // Queue second operation
      const secondPromise = mutex.acquire(secondOperation, {
        sessionId: "session-2",
        operation: "capture",
      });

      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(first).toBe("first-result");
      expect(second).toBe("second-result");
      // Second operation should have been called
      expect(secondOperation).toHaveBeenCalledTimes(1);
    });

    it("rejects third caller when two are waiting", async () => {
      const firstOperation = vi.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 100))
      );

      const secondOperation = vi.fn().mockResolvedValue("second");
      const thirdOperation = vi.fn().mockResolvedValue("third");

      // Start first operation (holds lock)
      mutex.acquire(firstOperation, {
        sessionId: "session-1",
        operation: "capture",
      });

      // Queue second operation
      mutex.acquire(secondOperation, {
        sessionId: "session-2",
        operation: "capture",
      });

      // Try to queue third operation - should be rejected
      await expect(
        mutex.acquire(thirdOperation, {
          sessionId: "session-3",
          operation: "capture",
        })
      ).rejects.toThrow(CamerasBusyError);
    });
  });

  describe("isLocked()", () => {
    it("returns correct state throughout lifecycle", async () => {
      expect(mutex.isLocked()).toBe(false);

      let capturedLockedState: boolean | null = null;
      const operation = vi.fn().mockImplementation(() => {
        capturedLockedState = mutex.isLocked();
        return Promise.resolve("result");
      });

      await mutex.acquire(operation, {
        sessionId: "test",
        operation: "capture",
      });

      expect(capturedLockedState).toBe(true);
      expect(mutex.isLocked()).toBe(false);
    });
  });

  describe("forceRelease()", () => {
    it("releases lock even when operation is still running", async () => {
      const longOperation = vi.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 1000))
      );

      // Start operation (don't await)
      mutex.acquire(longOperation, {
        sessionId: "test",
        operation: "capture",
      });

      expect(mutex.isLocked()).toBe(true);

      // Force release
      mutex.forceRelease();

      expect(mutex.isLocked()).toBe(false);
    });

    it("rejects queued capture in queue mode", async () => {
      mutex.setMode("queue");

      const firstOperation = vi.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 100))
      );

      const secondOperation = vi.fn().mockResolvedValue("second");

      // Start first operation
      mutex.acquire(firstOperation, {
        sessionId: "session-1",
        operation: "capture",
      });

      // Queue second operation
      const secondPromise = mutex.acquire(secondOperation, {
        sessionId: "session-2",
        operation: "capture",
      });

      // Force release while first is running
      mutex.forceRelease();

      // Second should be rejected
      await expect(secondPromise).rejects.toThrow(CamerasBusyError);
    });
  });
});
