#!/usr/bin/env node
/**
 * Simple EDSDK Test
 * Tests if EDSDK.dll can be loaded and identifies missing dependencies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('='.repeat(70));
console.log('Simple EDSDK Test');
console.log('='.repeat(70));
console.log();

// Find EDSDK.dll
let edsdkPath = null;
const possiblePaths = [
  'EDSDK.dll',
  path.join(__dirname, '..', 'EDSDK.dll'),
  path.join(process.cwd(), 'EDSDK.dll'),
  process.env.EDSDK_LIB_PATH,
];

for (const p of possiblePaths) {
  if (p && fs.existsSync(p)) {
    edsdkPath = path.resolve(p);
    break;
  }
}

if (!edsdkPath) {
  console.error('❌ EDSDK.dll not found');
  process.exit(1);
}

console.log(`✓ Found: ${edsdkPath}`);
console.log(`   Size: ${(fs.statSync(edsdkPath).size / 1024).toFixed(2)} KB`);
console.log();

// Test 1: Direct file access
console.log('Test 1: File Access');
try {
  const fd = fs.openSync(edsdkPath, 'r');
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);
  console.log(`   ✓ File readable (Magic bytes: ${buffer.toString('hex').toUpperCase()})`);
} catch (e) {
  console.log(`   ❌ Cannot read file: ${e.message}`);
}
console.log();

// Test 2: Try loading with koffi
console.log('Test 2: Loading with koffi');
try {
  const koffi = require('koffi');
  const lib = koffi.load(edsdkPath);
  console.log('   ✓ Successfully loaded EDSDK.dll!');
  console.log(`   Available exports: ${Object.keys(lib).length} functions`);
  
  // Try to call EdsInitializeSDK
  console.log();
  console.log('Test 3: Calling EdsInitializeSDK()');
  const result = lib.EdsInitializeSDK();
  if (result === 0) {
    console.log('   ✓ EDSDK initialized successfully!');
    
    // Get camera list
    const cameraListOut = [null];
    const listResult = lib.EdsGetCameraList(cameraListOut);
    console.log(`   EdsGetCameraList result: 0x${listResult.toString(16)}`);
    
    if (listResult === 0 && cameraListOut[0]) {
      console.log('   ✓ Got camera list reference');
      
      // Get camera count
      const countOut = [0];
      const countResult = lib.EdsGetChildCount(cameraListOut[0], countOut);
      console.log(`   Camera count: ${countOut[0]} (result: 0x${countResult.toString(16)})`);
      
      if (countOut[0] > 0) {
        console.log('   ✓ Camera(s) detected!');
      } else {
        console.log('   ⚠ No cameras connected');
      }
    } else {
      console.log('   ❌ Failed to get camera list');
    }
    
    // Cleanup
    lib.EdsTerminateSDK();
    console.log('   ✓ EDSDK terminated');
    
  } else {
    console.log(`   ❌ EdsInitializeSDK failed with error: 0x${result.toString(16)}`);
    console.log('   This usually means a required dependency is missing');
  }
  
} catch (error) {
  console.log(`   ❌ Failed to load: ${error.message}`);
  console.log();
  console.log('   Common causes:');
  console.log('   1. Missing Visual C++ Redistributables');
  console.log('   2. Missing Windows Universal CRT');
  console.log('   3. Architecture mismatch (need x64)');
  console.log();
  console.log('   Try downloading ALL VC++ redistributables:');
  console.log('   https://docs.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist');
}

console.log();
console.log('='.repeat(70));
