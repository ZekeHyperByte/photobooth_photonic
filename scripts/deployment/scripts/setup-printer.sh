#!/bin/bash
#
# Phase 4: Setup Printer (Auto-detect + Manual Fallback)
# Configure CUPS and auto-detect USB printer
#

set -e

echo "Setting up printer..."

# Start CUPS service
systemctl enable cups
systemctl start cups

# Wait for CUPS to start
sleep 2

# Function to list USB printers
list_usb_printers() {
    echo ""
    echo "Available USB printers:"
    lpinfo -v | grep "usb://" | nl
}

# Try auto-detect
echo "Attempting to auto-detect printer..."
USB_PRINTERS=$(lpinfo -v 2>/dev/null | grep "usb://" || true)

if [ -z "$USB_PRINTERS" ]; then
    echo "No USB printers detected."
    list_usb_printers
    
    echo ""
    read -p "Enter the number of your printer (or press Enter to skip): " PRINTER_NUM
    
    if [ -z "$PRINTER_NUM" ]; then
        echo "Skipping printer configuration."
        exit 0
    fi
    
    # Get selected printer URI
    PRINTER_URI=$(lpinfo -v 2>/dev/null | grep "usb://" | sed -n "${PRINTER_NUM}p" | awk '{print $2}')
    
    if [ -z "$PRINTER_URI" ]; then
        echo "ERROR: Invalid selection"
        exit 1
    fi
else
    # Auto-detected - count printers
    PRINTER_COUNT=$(echo "$USB_PRINTERS" | wc -l)
    
    if [ "$PRINTER_COUNT" -eq 1 ]; then
        # Only one printer - use it
        PRINTER_URI=$(echo "$USB_PRINTERS" | awk '{print $2}')
        echo "Found printer: $PRINTER_URI"
    else
        # Multiple printers - ask user
        echo "Multiple printers found:"
        echo "$USB_PRINTERS" | nl
        
        read -p "Enter the number of your printer: " PRINTER_NUM
        PRINTER_URI=$(echo "$USB_PRINTERS" | sed -n "${PRINTER_NUM}p" | awk '{print $2}')
        
        if [ -z "$PRINTER_URI" ]; then
            echo "ERROR: Invalid selection"
            exit 1
        fi
    fi
fi

# Get printer name
read -p "Enter a name for this printer (default: PhotonicPrinter): " PRINTER_NAME
PRINTER_NAME=${PRINTER_NAME:-PhotonicPrinter}

# Try to auto-detect driver
DRIVER=$(lpinfo -m 2>/dev/null | grep -i "everywhere\|gutenprint\|epson" | head -1 | awk '{print $1}')

if [ -z "$DRIVER" ]; then
    DRIVER="everywhere"
fi

echo ""
echo "Configuring printer..."
echo "  Name: $PRINTER_NAME"
echo "  URI: $PRINTER_URI"
echo "  Driver: $DRIVER"

# Add printer
lpadmin -p "$PRINTER_NAME" -E -v "$PRINTER_URI" -m "$DRIVER" 2>/dev/null || {
    echo "WARNING: Could not auto-configure driver, using raw mode"
    lpadmin -p "$PRINTER_NAME" -E -v "$PRINTER_URI"
}

# Set as default
lpadmin -d "$PRINTER_NAME"

echo ""
echo "✓ Printer configured successfully!"
echo "  Default printer: $PRINTER_NAME"

# Test print
read -p "Print test page? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Sending test page..."
    lp -d "$PRINTER_NAME" /usr/share/cups/data/testprint.pdf 2>/dev/null || {
        echo "Note: Test page command sent (check printer for output)"
    }
fi
