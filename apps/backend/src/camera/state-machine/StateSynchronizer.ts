/**
 * State Synchronizer
 *
 * Waits for camera properties and state to reach expected values.
 * This eliminates race conditions by synchronizing with the camera's actual state,
 * rather than assuming operations complete immediately.
 */

import * as C from "../bindings/constants";
import {
  SyncConfig,
  DEFAULT_SYNC_CONFIG,
  PropertyWaitResult,
  PropertySyncError,
} from "./types";
import { cameraLogger } from "../logger";

export class StateSynchronizer {
  private config: SyncConfig;

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
  }

  /**
   * Wait for a property to reach an expected value
   *
   * @param getProperty - Function to read the property value
   * @param expectedValue - The value to wait for
   * @param timeoutMs - Maximum time to wait (defaults to config)
   * @returns Result indicating success and final value
   */
  async waitForProperty<T>(
    getProperty: () => Promise<T | null>,
    expectedValue: T,
    timeoutMs?: number
  ): Promise<PropertyWaitResult<T>> {
    const startTime = Date.now();
    const timeout = timeoutMs ?? this.config.timeoutMs;
    let attempts = 0;

    cameraLogger.debug(
      `StateSynchronizer: Waiting for property to equal ${expectedValue} (timeout: ${timeout}ms)`
    );

    while (Date.now() - startTime < timeout) {
      attempts++;

      try {
        const value = await getProperty();

        if (value === expectedValue) {
          const elapsed = Date.now() - startTime;
          cameraLogger.debug(
            `StateSynchronizer: Property reached expected value ${expectedValue} after ${elapsed}ms (${attempts} attempts)`
          );
          return {
            success: true,
            value,
            attempts,
            elapsedMs: elapsed,
          };
        }

        // Property not yet at expected value, wait and retry
        await this.sleep(this.config.pollIntervalMs);
      } catch (error) {
        // Error reading property (e.g., DEVICE_BUSY), retry
        cameraLogger.debug(
          `StateSynchronizer: Error reading property (attempt ${attempts}): ${error}`
        );
        await this.sleep(this.config.pollIntervalMs);
      }
    }

    // Timeout reached
    const elapsed = Date.now() - startTime;
    const finalValue = await getProperty().catch(() => null);

    cameraLogger.warn(
      `StateSynchronizer: Timeout waiting for property to equal ${expectedValue} after ${elapsed}ms (${attempts} attempts), final value: ${finalValue}`
    );

    return {
      success: false,
      value: finalValue ?? undefined,
      attempts,
      elapsedMs: elapsed,
    };
  }

  /**
   * Wait for camera to be ready (not busy)
   *
   * Polls battery level property as a proxy for camera readiness.
   * If camera is busy, the property read will fail with DEVICE_BUSY.
   *
   * @param edsGetPropertyData - EDSDK get property function
   * @param cameraRef - Camera reference
   * @param timeoutMs - Maximum time to wait
   * @returns true if camera became ready, false if timeout
   */
  async waitForReady(
    edsGetPropertyData: (
      ref: any,
      propId: number,
      param: number,
      size: number,
      data: Buffer
    ) => number,
    cameraRef: any,
    timeoutMs?: number
  ): Promise<boolean> {
    const startTime = Date.now();
    const timeout = timeoutMs ?? this.config.timeoutMs;
    let attempts = 0;

    cameraLogger.debug(
      `StateSynchronizer: Waiting for camera to be ready (timeout: ${timeout}ms)`
    );

    while (Date.now() - startTime < timeout) {
      attempts++;

      const testBuf = Buffer.alloc(4);
      const err = edsGetPropertyData(
        cameraRef,
        C.kEdsPropID_BatteryLevel,
        0,
        4,
        testBuf
      );

      if (err === C.EDS_ERR_OK) {
        const elapsed = Date.now() - startTime;
        cameraLogger.debug(
          `StateSynchronizer: Camera ready after ${elapsed}ms (${attempts} attempts)`
        );
        return true;
      }

      if (err === C.EDS_ERR_DEVICE_BUSY) {
        // Expected - camera is busy, wait and retry
        await this.sleep(this.config.pollIntervalMs);
      } else {
        // Other error, log and retry
        cameraLogger.debug(
          `StateSynchronizer: Unexpected error checking ready state (attempt ${attempts}): 0x${err.toString(
            16
          )}`
        );
        await this.sleep(this.config.pollIntervalMs);
      }
    }

    cameraLogger.warn(
      `StateSynchronizer: Timeout waiting for camera ready after ${timeout}ms (${attempts} attempts)`
    );
    return false;
  }

  /**
   * Poll a property until a condition is met
   *
   * @param getProperty - Function to read the property
   * @param predicate - Condition to check
   * @param timeoutMs - Maximum time to wait
   * @returns The value when condition was met, or null on timeout
   */
  async pollUntil<T>(
    getProperty: () => Promise<T | null>,
    predicate: (value: T) => boolean,
    timeoutMs?: number
  ): Promise<T | null> {
    const startTime = Date.now();
    const timeout = timeoutMs ?? this.config.timeoutMs;

    while (Date.now() - startTime < timeout) {
      try {
        const value = await getProperty();
        if (value !== null && predicate(value)) {
          return value;
        }
      } catch (error) {
        // Ignore errors during polling
      }

      await this.sleep(this.config.pollIntervalMs);
    }

    return null;
  }

  /**
   * Get property with automatic retry on busy errors
   *
   * @param edsGetPropertyData - EDSDK get property function
   * @param cameraRef - Camera reference
   * @param propertyId - Property to read
   * @param size - Size of property data (usually 4 for uint32)
   * @returns The property value, or null on failure
   */
  async getPropertyWithRetry(
    edsGetPropertyData: (
      ref: any,
      propId: number,
      param: number,
      size: number,
      data: Buffer
    ) => number,
    cameraRef: any,
    propertyId: number,
    size: number = 4
  ): Promise<number | null> {
    for (let i = 0; i < this.config.maxRetries; i++) {
      const buf = Buffer.alloc(size);
      const err = edsGetPropertyData(cameraRef, propertyId, 0, size, buf);

      if (err === C.EDS_ERR_OK) {
        return buf.readUInt32LE(0);
      }

      if (err === C.EDS_ERR_DEVICE_BUSY) {
        cameraLogger.debug(
          `StateSynchronizer: Property 0x${propertyId.toString(
            16
          )} busy, retry ${i + 1}/${this.config.maxRetries}`
        );
        await this.sleep(this.config.retryDelayMs);
        continue;
      }

      // Non-retryable error
      cameraLogger.debug(
        `StateSynchronizer: Property 0x${propertyId.toString(
          16
        )} read failed: 0x${err.toString(16)}`
      );
      return null;
    }

    cameraLogger.warn(
      `StateSynchronizer: Property 0x${propertyId.toString(
        16
      )} still busy after ${this.config.maxRetries} retries`
    );
    return null;
  }

  /**
   * Set property and wait for it to take effect
   *
   * @param setProperty - Function to set the property
   * @param getProperty - Function to read the property back
   * @param expectedValue - Value to set and verify
   * @param timeoutMs - Maximum time to wait for verification
   * @returns true if property was set and verified
   */
  async setAndVerifyProperty<T>(
    setProperty: (value: T) => Promise<void>,
    getProperty: () => Promise<T | null>,
    expectedValue: T,
    timeoutMs?: number
  ): Promise<boolean> {
    // Set the property
    await setProperty(expectedValue);

    // Wait for it to take effect
    const result = await this.waitForProperty(
      getProperty,
      expectedValue,
      timeoutMs
    );

    return result.success;
  }

  /**
   * Execute an operation with automatic retry on busy errors
   *
   * @param operation - The operation to execute
   * @param isBusyError - Function to check if error is a busy error
   * @returns Result of the operation
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    isBusyError: (error: any) => boolean,
    maxRetries?: number
  ): Promise<T> {
    const retries = maxRetries ?? this.config.maxRetries;

    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (isBusyError(error) && i < retries - 1) {
          cameraLogger.debug(
            `StateSynchronizer: Operation busy, retry ${i + 1}/${retries}`
          );
          await this.sleep(this.config.retryDelayMs);
          continue;
        }
        throw error;
      }
    }

    // Should never reach here, but just in case
    throw new Error("executeWithRetry exhausted retries without success");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
