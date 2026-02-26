/**
 * Quick Camera System v2 Test
 * 
 * Minimal test for rapid iteration.
 * Run with: pnpm tsx test-camera-v2-quick.ts
 */

import { EdsdkV2Provider } from "./src/camera/providers/edsdk-v2";
import * as fs from "fs";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function quickTest() {
  console.log("🎥 Camera System v2 - Quick Test\n");
  
  const provider = new EdsdkV2Provider();
  
  try {
    // 1. Connect
    console.log("1️⃣  Initializing...");
    await provider.initialize();
    const status = await provider.getStatus();
    console.log(`   ✅ Connected: ${status.model} (Battery: ${status.battery}%)\n`);
    
    // 2. Start Live View
    console.log("2️⃣  Starting live view...");
    await provider.startLiveView();
    console.log("   ✅ Live view active\n");
    
    // 3. Get some frames
    console.log("3️⃣  Capturing 10 frames...");
    for (let i = 0; i < 10; i++) {
      const frame = await provider.getLiveViewFrame();
      process.stdout.write(frame.length > 0 ? "✓" : "·");
      await sleep(100);
    }
    console.log("\n   ✅ Frame capture complete\n");
    
    // 4. Capture photo
    console.log("4️⃣  Capturing photo...");
    const result = await provider.capturePhoto("quick-test", 1);
    console.log(`   ✅ Photo: ${result.imagePath}`);
    console.log(`   ✅ Live view resumed: ${provider.isLiveViewActive()}\n`);
    
    // 5. Cleanup
    console.log("5️⃣  Cleaning up...");
    await provider.stopLiveView();
    await provider.disconnect();
    
    // Remove test photo
    if (fs.existsSync(result.imagePath)) {
      fs.unlinkSync(result.imagePath);
    }
    console.log("   ✅ Complete!\n");
    
    console.log("🎉 All quick tests passed!");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    
    // Cleanup on error
    try {
      await provider.disconnect();
    } catch {
      // Ignore
    }
    
    process.exit(1);
  }
}

quickTest();
