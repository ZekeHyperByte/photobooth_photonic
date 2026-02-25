#!/usr/bin/env node
/**
 * EDSDK Dependency Checker
 * 
 * This script checks what dependencies EDSDK.dll requires and which are missing.
 * Run with: node scripts/check-edsdk-deps.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('='.repeat(70));
console.log('EDSDK Dependency Checker');
console.log('='.repeat(70));
console.log();

// Find EDSDK.dll
const possiblePaths = [
  'EDSDK.dll',
  path.join(__dirname, '..', 'EDSDK.dll'),
  path.join(process.cwd(), 'EDSDK.dll'),
  process.env.EDSDK_LIB_PATH,
  path.join(__dirname, '..', '..', '..', 'EDSDK.dll'),
];

let edsdkPath = null;
for (const p of possiblePaths) {
  if (p && fs.existsSync(p)) {
    edsdkPath = p;
    break;
  }
}

if (!edsdkPath) {
  console.error('❌ EDSDK.dll not found in any of these locations:');
  possiblePaths.forEach(p => console.log(`   - ${p || '(not set)'}`));
  process.exit(1);
}

console.log(`✓ Found EDSDK.dll at: ${edsdkPath}`);
console.log();

// Method 1: Try to load with detailed error using koffi
try {
  console.log('Method 1: Testing direct koffi load...');
  const koffi = require('koffi');
  
  // Set up error handling
  process.on('uncaughtException', (err) => {
    console.error('❌ Failed to load EDSDK.dll:');
    console.error(`   Error: ${err.message}`);
    
    if (err.message.includes('specified module could not be found')) {
      console.log();
      console.log('💡 This means a DEPENDENCY of EDSDK.dll is missing.');
      console.log('   The DLL file exists, but it needs other DLLs to run.');
    }
    
    process.exit(1);
  });
  
  const lib = koffi.load(edsdkPath);
  console.log('✓ Successfully loaded EDSDK.dll with koffi!');
  console.log(`   Available functions: ${Object.keys(lib).length}`);
  
} catch (error) {
  console.error('❌ Method 1 failed:', error.message);
}

console.log();

// Method 2: Check with dumpbin (if available)
console.log('Method 2: Checking DLL dependencies with dumpbin...');
try {
  const dumpbinPath = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.39.33519\\bin\\Hostx64\\x64\\dumpbin.exe';
  
  // Try to find dumpbin
  let dumpbin = 'dumpbin';
  try {
    execSync('where dumpbin', { encoding: 'utf8' });
  } catch {
    // Try common VS paths
    const vsPaths = [
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC',
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Tools\\MSVC',
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Tools\\MSVC',
      'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\VC\\Tools\\MSVC',
    ];
    
    for (const basePath of vsPaths) {
      if (fs.existsSync(basePath)) {
        const versions = fs.readdirSync(basePath);
        if (versions.length > 0) {
          dumpbin = path.join(basePath, versions[0], 'bin', 'Hostx64', 'x64', 'dumpbin.exe');
          if (fs.existsSync(dumpbin)) break;
        }
      }
    }
  }
  
  if (fs.existsSync(dumpbin)) {
    const result = execSync(`"${dumpbin}" /dependents "${edsdkPath}"`, { encoding: 'utf8' });
    
    console.log('   Dependencies found:');
    const lines = result.split('\n');
    let inDependencies = false;
    
    for (const line of lines) {
      if (line.includes('Image has the following dependencies')) {
        inDependencies = true;
        continue;
      }
      if (inDependencies && line.trim() && !line.includes('---')) {
        const dep = line.trim();
        if (dep && !dep.startsWith('Summary')) {
          // Check if this DLL exists in system
          try {
            execSync(`where ${dep}`, { encoding: 'utf8', stdio: 'pipe' });
            console.log(`   ✓ ${dep}`);
          } catch {
            console.log(`   ❌ ${dep} - MISSING!`);
          }
        }
      }
      if (line.includes('Summary')) break;
    }
  } else {
    console.log('   dumpbin.exe not found. Install Visual Studio Build Tools or check manually.');
  }
} catch (error) {
  console.log(`   Error running dumpbin: ${error.message}`);
}

console.log();

// Method 3: Check Windows System directories for common dependencies
console.log('Method 3: Checking common dependencies in System directories...');
const commonDeps = [
  'MSVCP140.dll',
  'VCRUNTIME140.dll',
  'VCRUNTIME140_1.dll',
  'api-ms-win-crt-runtime-l1-1-0.dll',
  'api-ms-win-crt-string-l1-1-0.dll',
  'api-ms-win-crt-heap-l1-1-0.dll',
];

const systemPaths = [
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
];

for (const dep of commonDeps) {
  let found = false;
  for (const sysPath of systemPaths) {
    if (fs.existsSync(path.join(sysPath, dep))) {
      found = true;
      break;
    }
  }
  
  if (found) {
    console.log(`   ✓ ${dep}`);
  } else {
    console.log(`   ❌ ${dep} - MISSING!`);
  }
}

console.log();
console.log('='.repeat(70));
console.log('Recommendations:');
console.log('='.repeat(70));
console.log();
console.log('If you see MISSING dependencies above:');
console.log();
console.log('1. Install Visual C++ Redistributables (ALL versions):');
console.log('   x64: https://aka.ms/vs/17/release/vc_redist.x64.exe');
console.log('   x86: https://aka.ms/vs/17/release/vc_redist.x86.exe');
console.log();
console.log('2. Install ALL Visual Studio 2015-2022 Redistributables:');
console.log('   https://docs.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist');
console.log();
console.log('3. Alternative: Copy ALL DLLs from the Canon EDSDK package to the same folder as EDSDK.dll');
console.log();
console.log('4. Check the EDSDK documentation for specific requirements');
console.log();
