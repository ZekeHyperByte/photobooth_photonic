#!/bin/bash
#
# Test Script: Capture without stopping live view
# Tests if Canon camera can capture while live view is active
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKEND_FILE="services/camera/src/backends/gphoto2_backend.py"
BACKUP_FILE="services/camera/src/backends/gphoto2_backend.py.test-backup"
TEST_SESSION="test-liveview-$(date +%s)"

log() {
    echo -e "$1"
}

log_info() {
    log "${BLUE}[INFO]${NC} $1"
}

log_success() {
    log "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    log "${RED}[ERROR]${NC} $1"
}

log_warn() {
    log "${YELLOW}[WARN]${NC} $1"
}

# Check if services are running
check_services() {
    log_info "Checking if Photonic services are running..."
    
    if ! curl -s http://localhost:4000/health > /dev/null 2>&1; then
        log_error "Backend is not running. Please start it first:"
        log "  cd ~/photonic-v0.1 && pm2 start ecosystem.config.js"
        exit 1
    fi
    
    if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
        log_error "Camera service is not responding"
        exit 1
    fi
    
    log_success "Services are running"
}

# Backup current config
backup_config() {
    log_info "Backing up current camera configuration..."
    cp "$BACKEND_FILE" "$BACKUP_FILE"
    log_success "Backup created: $BACKUP_FILE"
}

# Restore original config
restore_config() {
    log_info "Restoring original configuration..."
    if [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$BACKEND_FILE"
        rm "$BACKUP_FILE"
        log_success "Original config restored"
    fi
}

# Modify config to NOT stop live view
enable_liveview_capture() {
    log_info "Modifying config to capture WITHOUT stopping live view..."
    
    # Change disable_viewfinder_before_capture from True to False
    sed -i 's/disable_viewfinder_before_capture: bool = True/disable_viewfinder_before_capture: bool = False/' "$BACKEND_FILE"
    
    # Verify change
    if grep -q "disable_viewfinder_before_capture: bool = False" "$BACKEND_FILE"; then
        log_success "Config modified: viewfinder will NOT be disabled before capture"
    else
        log_error "Failed to modify config"
        restore_config
        exit 1
    fi
}

# Test capture and measure timing
test_capture() {
    local test_name=$1
    log ""
    log "========================================"
    log "  Testing: $test_name"
    log "========================================"
    
    # Create test session
    log_info "Creating test session..."
    local session_response=$(curl -s -X POST http://localhost:4000/api/sessions \
        -H "Content-Type: application/json" \
        -d '{"packageId": 1}' || echo '{"success": false}')
    
    local session_id=$(echo "$session_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$session_id" ]; then
        log_error "Failed to create test session"
        return 1
    fi
    
    log_success "Session created: $session_id"
    
    # Start live view first
    log_info "Starting live view..."
    curl -s -X POST http://localhost:4000/api/camera/liveview/start > /dev/null 2>&1 || true
    sleep 2
    
    # Check if live view is active
    local lv_status=$(curl -s http://localhost:4000/api/camera/status 2>/dev/null | grep -o '"liveview_active":[^,}]*' | cut -d':' -f2 || echo "false")
    log_info "Live view status: $lv_status"
    
    # Time the capture
    log_info "Triggering capture..."
    local start_time=$(date +%s%N)
    
    local capture_response=$(curl -s -w "\n%{http_code}" -X POST http://localhost:4000/api/photos/capture \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\": \"$session_id\", \"sequenceNumber\": 1}")
    
    local http_code=$(echo "$capture_response" | tail -n1)
    local response_body=$(echo "$capture_response" | sed '$d')
    local end_time=$(date +%s%N)
    
    # Calculate duration in milliseconds
    local duration=$(( (end_time - start_time) / 1000000 ))
    
    log_info "Capture duration: ${duration}ms"
    log_info "HTTP Status: $http_code"
    
    # Check if capture succeeded
    if [ "$http_code" == "200" ]; then
        log_success "Capture succeeded!"
        
        # Check if live view is still active after capture
        sleep 1
        local lv_after=$(curl -s http://localhost:4000/api/camera/status 2>/dev/null | grep -o '"liveview_active":[^,}]*' | cut -d':' -f2 || echo "false")
        log_info "Live view after capture: $lv_after"
        
        if [ "$lv_after" == "true" ]; then
            log_success "✓ Live view remained active!"
        else
            log_warn "Live view stopped after capture (might be normal)"
        fi
        
        return 0
    else
        log_error "Capture failed!"
        log "Response: $response_body"
        return 1
    fi
}

# Restart camera service to apply config changes
restart_camera_service() {
    log_info "Restarting camera service to apply changes..."
    pm2 restart photonic-camera
    sleep 3
    
    # Wait for camera to be ready
    local retries=0
    while [ $retries -lt 10 ]; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            log_success "Camera service is ready"
            return 0
        fi
        sleep 1
        retries=$((retries + 1))
    done
    
    log_error "Camera service failed to start"
    return 1
}

# Run tests with current config (stopping live view)
test_with_stop() {
    log ""
    log "########################################"
    log "# TEST 1: Current behavior            #"
    log "# (Live view STOPS before capture)    #"
    log "########################################"
    
    # Make sure we're using original config
    restore_config
    restart_camera_service
    
    test_capture "With live view STOP"
}

# Run tests without stopping live view
test_without_stop() {
    log ""
    log "########################################"
    log "# TEST 2: Optimized behavior          #"
    log "# (Live view KEEPS RUNNING)           #"
    log "########################################"
    
    enable_liveview_capture
    restart_camera_service
    
    test_capture "With live view KEEP RUNNING"
}

# Cleanup function
cleanup() {
    log ""
    log_info "Cleaning up..."
    restore_config
    restart_camera_service
    log_success "Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Main execution
main() {
    log ""
    log "╔════════════════════════════════════════════════════════╗"
    log "║  Photonic Live View Capture Test                      ║"
    log "║  Testing: Can we capture without stopping live view?  ║"
    log "╚════════════════════════════════════════════════════════╝"
    log ""
    
    # Check prerequisites
    check_services
    backup_config
    
    # Run tests
    test_with_stop
    test_without_stop
    
    # Summary
    log ""
    log "========================================"
    log "  Test Complete!"
    log "========================================"
    log ""
    log_info "Compare the timing between the two tests:"
    log "  - Test 1 (with stop): Should be slower (mode switching)"
    log "  - Test 2 (without stop): Should be faster (no mode switch)"
    log ""
    log_warn "Note: If Test 2 fails, your camera requires stopping live view"
    log "      This is normal for some Canon models."
    log ""
}

# Run main
main
