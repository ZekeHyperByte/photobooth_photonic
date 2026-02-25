/**
 * EDSDK Native Package
 *
 * Canon EDSDK native library distribution for Photonic.
 * This package contains the Windows DLLs and headers for Canon camera integration.
 */

import path from "path";
import fs from "fs";

/**
 * SDK Version Information
 */
export interface SdkVersionInfo {
  version: string;
  dllPath: string;
  edsImagePath: string;
  compatibleModels: string[];
}

/**
 * Available SDK versions
 */
export const SDK_VERSIONS: SdkVersionInfo[] = [
  {
    version: "13.20.10",
    dllPath: getDllPath("13.20.10"),
    edsImagePath: getEdsImagePath("13.20.10"),
    compatibleModels: [
      "EOS R.*",
      "EOS 90D",
      "850D",
      "250D",
    ],
  },
  {
    version: "13.13.0",
    dllPath: getDllPath("13.13.0"),
    edsImagePath: getEdsImagePath("13.13.0"),
    compatibleModels: [
      "EOS 550D",
      "EOS 600D",
      "EOS 650D",
      "EOS 700D",
      "EOS 60D",
      "EOS 7D",
      "EOS 5D Mark II",
      "EOS 5D Mark III",
    ],
  },
];

/**
 * Get the package root directory
 */
function getPackageRoot(): string {
  return __dirname;
}

/**
 * Get DLL path for a specific version
 */
function getDllPath(version: string): string {
  return path.join(getPackageRoot(), "win64", `v${version}`, "EDSDK.dll");
}

/**
 * Get EdsImage.dll path for a specific version
 */
function getEdsImagePath(version: string): string {
  return path.join(getPackageRoot(), "win64", `v${version}`, "EdsImage.dll");
}

/**
 * Get header file paths
 */
export function getHeaderPaths(): {
  edsSdkHeader: string;
  edsSdkTypesHeader: string;
} {
  const headersDir = path.join(getPackageRoot(), "headers");
  return {
    edsSdkHeader: path.join(headersDir, "EDSDK.h"),
    edsSdkTypesHeader: path.join(headersDir, "EDSDKTypes.h"),
  };
}

/**
 * Check if a specific SDK version is available
 */
export function isSdkVersionAvailable(version: string): boolean {
  const dllPath = getDllPath(version);
  try {
    fs.accessSync(dllPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the best available SDK version for a camera model
 */
export function getBestSdkVersionForCamera(cameraModel: string): SdkVersionInfo | null {
  for (const sdkVersion of SDK_VERSIONS) {
    for (const pattern of sdkVersion.compatibleModels) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(cameraModel)) {
        if (isSdkVersionAvailable(sdkVersion.version)) {
          return sdkVersion;
        }
      }
    }
  }
  
  // Return the first available version as fallback
  for (const sdkVersion of SDK_VERSIONS) {
    if (isSdkVersionAvailable(sdkVersion.version)) {
      return sdkVersion;
    }
  }
  
  return null;
}

/**
 * Get all available SDK versions
 */
export function getAvailableSdkVersions(): SdkVersionInfo[] {
  return SDK_VERSIONS.filter((v) => isSdkVersionAvailable(v.version));
}

/**
 * Default export - path to the latest available SDK
 */
export function getDefaultSdkPath(): string {
  for (const sdkVersion of SDK_VERSIONS) {
    if (isSdkVersionAvailable(sdkVersion.version)) {
      return sdkVersion.dllPath;
    }
  }
  throw new Error("No EDSDK version available");
}

// Re-export for convenience
export { SDK_VERSIONS as EDSDK_VERSIONS };
export default getDefaultSdkPath;
