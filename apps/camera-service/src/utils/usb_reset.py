"""
USB Reset Utility for Camera Recovery

Performs software USB device resets via sysfs to recover cameras
stuck in PTP timeout state. This avoids the need for physical
power cycling of the camera.

Requires write access to /sys/bus/usb/devices/*/authorized
(either via sudo or appropriate udev rules).
"""

import os
import time
import glob
import logging

logger = logging.getLogger(__name__)


class UsbResetHelper:
    """Handles USB device reset via sysfs for camera recovery."""

    # Default Canon USB vendor ID
    DEFAULT_VENDOR_ID = "04a9"

    def __init__(self, vendor_id: str = None, settle_time: float = 3.0):
        """
        Initialize USB reset helper.

        Args:
            vendor_id: USB vendor ID to search for (default: Canon '04a9')
            settle_time: Seconds to wait after reset for device re-enumeration
        """
        self.vendor_id = vendor_id or self.DEFAULT_VENDOR_ID
        self.settle_time = settle_time
        self._cached_sysfs_path = None

    def find_camera_sysfs_path(self) -> str:
        """
        Find the sysfs path for the camera USB device.

        Scans /sys/bus/usb/devices/*/idVendor for the configured vendor ID.

        Returns:
            Sysfs device path (e.g., '/sys/bus/usb/devices/1-4')

        Raises:
            FileNotFoundError: If no matching USB device is found
        """
        sysfs_base = "/sys/bus/usb/devices"

        for vendor_file in glob.glob(os.path.join(sysfs_base, "*/idVendor")):
            try:
                with open(vendor_file, "r") as f:
                    vendor = f.read().strip()

                if vendor == self.vendor_id:
                    device_path = os.path.dirname(vendor_file)
                    # Verify the authorized file exists (confirms it's a real device)
                    auth_file = os.path.join(device_path, "authorized")
                    if os.path.exists(auth_file):
                        logger.info(f"Found camera USB device at: {device_path}")
                        self._cached_sysfs_path = device_path
                        return device_path
            except (IOError, OSError) as e:
                logger.debug(f"Could not read {vendor_file}: {e}")
                continue

        raise FileNotFoundError(
            f"No USB device found with vendor ID '{self.vendor_id}'. "
            f"Is the camera connected?"
        )

    def reset_usb_device(self, sysfs_path: str = None) -> bool:
        """
        Perform a USB device reset by toggling the 'authorized' sysfs attribute.

        This deauthorizes the device (effectively disconnecting it from the bus),
        waits briefly, then reauthorizes it (triggering re-enumeration).

        Args:
            sysfs_path: Sysfs device path. If None, auto-detects using vendor ID.

        Returns:
            True if reset succeeded, False otherwise
        """
        if sysfs_path is None:
            if self._cached_sysfs_path and os.path.exists(
                os.path.join(self._cached_sysfs_path, "authorized")
            ):
                sysfs_path = self._cached_sysfs_path
            else:
                try:
                    sysfs_path = self.find_camera_sysfs_path()
                except FileNotFoundError as e:
                    logger.error(f"Cannot reset: {e}")
                    return False

        auth_file = os.path.join(sysfs_path, "authorized")

        if not os.path.exists(auth_file):
            logger.error(f"Authorized file not found: {auth_file}")
            return False

        logger.warning(f"Performing USB reset on device: {sysfs_path}")

        try:
            # Step 1: Deauthorize (disconnect from bus)
            logger.info("Deauthorizing USB device...")
            with open(auth_file, "w") as f:
                f.write("0")

            # Step 2: Wait for device to fully disconnect
            time.sleep(1.0)

            # Step 3: Reauthorize (trigger re-enumeration)
            logger.info("Reauthorizing USB device...")
            with open(auth_file, "w") as f:
                f.write("1")

            # Step 4: Wait for device to re-enumerate and settle
            logger.info(
                f"Waiting {self.settle_time}s for device to re-enumerate..."
            )
            time.sleep(self.settle_time)

            # Step 5: Verify device came back
            try:
                new_path = self.find_camera_sysfs_path()
                logger.info(f"USB reset successful. Camera at: {new_path}")
                return True
            except FileNotFoundError:
                logger.error(
                    "USB reset completed but camera not detected after re-enumeration"
                )
                return False

        except PermissionError:
            logger.error(
                f"Permission denied writing to {auth_file}. "
                f"Run the service with sudo or add a udev rule granting "
                f"write access to the USB authorized file."
            )
            return False
        except (IOError, OSError) as e:
            logger.error(f"USB reset failed: {e}")
            return False

    def get_device_info(self) -> dict:
        """
        Get information about the camera USB device.

        Returns:
            Dict with device info or empty dict if not found
        """
        try:
            sysfs_path = self.find_camera_sysfs_path()
        except FileNotFoundError:
            return {}

        info = {"sysfs_path": sysfs_path}

        for attr in ["idVendor", "idProduct", "manufacturer", "product",
                      "serial", "speed", "busnum", "devnum"]:
            attr_file = os.path.join(sysfs_path, attr)
            try:
                with open(attr_file, "r") as f:
                    info[attr] = f.read().strip()
            except (IOError, OSError):
                pass

        # Power management info
        power_dir = os.path.join(sysfs_path, "power")
        for attr in ["control", "autosuspend_delay_ms"]:
            attr_file = os.path.join(power_dir, attr)
            try:
                with open(attr_file, "r") as f:
                    info[f"power_{attr}"] = f.read().strip()
            except (IOError, OSError):
                pass

        return info
