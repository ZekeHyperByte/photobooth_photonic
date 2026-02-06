/**
 * Camera Module Exports for Linux
 * Uses GPhoto2 instead of Canon SDK
 */

const GPhoto2Wrapper = require("./gphoto2-wrapper");
const CameraController = require("./camera-controller");

module.exports = {
  // GPhoto2 wrapper (low-level)
  GPhoto2Wrapper,

  // High-level controller
  CameraController,
};
