/**
 * Camera System v2 Test Script
 * 
 * Tests the new event-driven state machine camera provider.
 * Run with: pnpm tsx test-camera-v2.ts
 */

import { EdsdkV2Provider } from "./src/camera/providers/edsdk-v2";
import { cameraLogger } from "./src/camera/logger";
import * as fs from "fs";
import * as path from "path";

// Test configuration
const TEST_OUTPUT_DIR = "./test-photos";
const TEST_SESSION_ID = `test-${Date.now()}`;

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Test results
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log("=".repeat(60));
  
  const startTime = Date.now();
  
  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, passed: true, duration });
    console.log(`✅ PASSED (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`❌ FAILED (${duration}ms)`);
    console.log(`   Error: ${errorMsg}`);
  }
}

// Test 1: Initialize and connect
async function testInitialize() {
  const provider = new EdsdkV2Provider();
  
  console.log("Initializing camera...");
  await provider.initialize();
  
  if (!provider.isConnected()) {
    throw new Error("Provider reports not connected after initialization");
  }
  
  const status = await provider.getStatus();
  console.log(`Camera: ${status.model}`);
  console.log(`Battery: ${status.battery}%`);
  
  await provider.disconnect();
  console.log("Disconnected successfully");
}

// Test 2: Live view start/stop
async function testLiveViewStartStop() {
  const provider = new EdsdkV2Provider();
  
  await provider.initialize();
  
  console.log("Starting live view...");
  await provider.startLiveView();
  
  if (!provider.isLiveViewActive()) {
    throw new Error("Live view not active after startLiveView()");
  }
  
  console.log("Live view active, waiting 2 seconds...");
  await sleep(2000);
  
  console.log("Stopping live view...");
  await provider.stopLiveView();
  
  if (provider.isLiveViewActive()) {
    throw new Error("Live view still active after stopLiveView()");
  }
  
  await provider.disconnect();
}

// Test 3: Live view frame capture
async function testLiveViewFrames() {
  const provider = new EdsdkV2Provider();
  
  await provider.initialize();
  await provider.startLiveView();
  
  console.log("Capturing 30 frames...");
  let validFrames = 0;
  let emptyFrames = 0;
  
  for (let i = 0; i < 30; i++) {
    const frame = await provider.getLiveViewFrame();
    
    if (frame.length > 0) {
      validFrames++;
      // Verify it's a JPEG
      if (frame[0] !== 0xff || frame[1] !== 0xd8) {
        throw new Error(`Frame ${i} is not a valid JPEG`);
      }
    } else {
      emptyFrames++;
    }
    
    await sleep(33); // ~30fps
  }
  
  console.log(`Valid frames: ${validFrames}/30`);
  console.log(`Empty frames: ${emptyFrames}/30`);
  
  if (validFrames < 15) {
    throw new Error(`Too few valid frames: ${validFrames}/30`);
  }
  
  await provider.stopLiveView();
  await provider.disconnect();
}

// Test 4: Live view cycle stress test
async function testLiveViewCycles() {
  const provider = new EdsdkV2Provider();
  
  await provider.initialize();
  
  console.log("Running 5 live view cycles...");
  
  for (let i = 0; i < 5; i++) {
    console.log(`  Cycle ${i + 1}/5...`);
    
    await provider.startLiveView();
    await sleep(500); // Run for 0.5 seconds
    
    // Get a frame
    const frame = await provider.getLiveViewFrame();
    if (frame.length === 0) {
      throw new Error(`Cycle ${i + 1}: No frame captured`);
    }
    
    await provider.stopLiveView();
    await sleep(200); // Brief pause between cycles
  }
  
  console.log("All 5 cycles completed successfully");
  
  await provider.disconnect();
}

// Test 5: Photo capture
async function testPhotoCapture() {
  const provider = new EdsdkV2Provider();
  
  // Ensure output directory exists
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
  
  await provider.initialize();
  await provider.startLiveView();
  
  console.log("Capturing photo...");
  const result = await provider.capturePhoto(TEST_SESSION_ID, 1);
  
  console.log(`Photo saved: ${result.imagePath}`);
  
  // Verify file exists
  if (!fs.existsSync(result.imagePath)) {
    throw new Error("Photo file not found after capture");
  }
  
  // Verify file size
  const stats = fs.statSync(result.imagePath);
  if (stats.size < 100000) {
    throw new Error(`Photo file too small: ${stats.size} bytes`);
  }
  
  console.log(`File size: ${stats.size} bytes`);
  
  // Verify live view resumed
  if (!provider.isLiveViewActive()) {
    throw new Error("Live view did not resume after capture");
  }
  
  await provider.stopLiveView();
  await provider.disconnect();
  
  // Cleanup
  try {
    fs.unlinkSync(result.imagePath);
    console.log("Test photo cleaned up");
  } catch {
    // Ignore cleanup errors
  }
}

// Test 6: Multiple captures with live view
async function testMultipleCaptures() {
  const provider = new EdsdkV2Provider();
  
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
  
  await provider.initialize();
  await provider.startLiveView();
  
  console.log("Capturing 3 photos...");
  const capturedFiles: string[] = [];
  
  for (let i = 1; i <= 3; i++) {
    console.log(`  Photo ${i}/3...`);
    const result = await provider.capturePhoto(TEST_SESSION_ID, i);
    capturedFiles.push(result.imagePath);
    
    // Brief pause between captures
    await sleep(1000);
  }
  
  console.log("All 3 photos captured");
  
  // Verify all files exist
  for (const file of capturedFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Photo not found: ${file}`);
    }
  }
  
  await provider.stopLiveView();
  await provider.disconnect();
  
  // Cleanup
  for (const file of capturedFiles) {
    try {
      fs.unlinkSync(file);
    } catch {
      // Ignore
    }
  }
}

// Test 7: Status monitoring
async function testStatusMonitoring() {
  const provider = new EdsdkV2Provider();
  
  await provider.initialize();
  
  console.log("Getting initial status...");
  let status = await provider.getStatus({ includeSettings: true });
  console.log(`Connected: ${status.connected}`);
  console.log(`Model: ${status.model}`);
  console.log(`Battery: ${status.battery}%`);
  
  await provider.startLiveView();
  
  console.log("\nStatus during live view...");
  status = await provider.getStatus();
  console.log(`Live view active: ${status.providerMetadata?.liveViewActive}`);
  
  if (status.liveView) {
    console.log(`FPS: ${status.liveView.fps}`);
    console.log(`Dropped frames: ${status.liveView.droppedFrames}`);
  }
  
  await provider.stopLiveView();
  await provider.disconnect();
}

// Main test runner
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("CAMERA SYSTEM V2 TEST SUITE");
  console.log("=".repeat(60));
  console.log(`\nTest Session ID: ${TEST_SESSION_ID}`);
  console.log(`Output Directory: ${TEST_OUTPUT_DIR}`);
  console.log("Make sure your Canon 550D is connected and turned on.");
  console.log("\nStarting tests in 3 seconds...");
  await sleep(3000);
  
  // Run all tests
  await runTest("Initialize & Connect", testInitialize);
  await runTest("Live View Start/Stop", testLiveViewStartStop);
  await runTest("Live View Frame Capture", testLiveViewFrames);
  await runTest("Live View Cycle Stress (5x)", testLiveViewCycles);
  await runTest("Photo Capture", testPhotoCapture);
  await runTest("Multiple Captures (3x)", testMultipleCaptures);
  await runTest("Status Monitoring", testStatusMonitoring);
  
  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\nTotal: ${results.length} tests`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\nTotal duration: ${totalDuration}ms`);
  
  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter(r => !r.passed)
      .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("\n❌ Unhandled error:", error);
  process.exit(1);
});

// Run tests
main().catch(error => {
  console.error("\n❌ Test runner error:", error);
  process.exit(1);
});
