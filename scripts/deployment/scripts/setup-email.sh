#!/bin/bash
#
# Phase 8: Setup Email Alerts (Gmail SMTP)
# Configure Gmail App Password for alerts
#

set -e

INSTALL_DIR="${1:-/opt/photonic}"
ENV_FILE="$INSTALL_DIR/apps/backend/.env"

echo "Setting up email alerts with Gmail SMTP..."
echo ""
echo "You'll need a Gmail App Password (not your regular password)"
echo ""
echo "To create an App Password:"
echo "  1. Go to https://myaccount.google.com/apppasswords"
echo "  2. Sign in to your Google Account"
echo "  3. Select 'Mail' and your device"
echo "  4. Copy the 16-character password"
echo ""

# Get email configuration
read -p "Gmail address (e.g., yourname@gmail.com): " GMAIL_USER

if [ -z "$GMAIL_USER" ]; then
    echo "No email provided. Skipping email setup."
    exit 0
fi

read -s -p "Gmail App Password (16 characters): " GMAIL_PASS
echo

if [ -z "$GMAIL_PASS" ]; then
    echo "No password provided. Skipping email setup."
    exit 0
fi

read -p "Alert recipient email [$GMAIL_USER]: " ALERT_TO
ALERT_TO=${ALERT_TO:-$GMAIL_USER}

echo ""
echo "Testing email configuration..."

# Create test script
cat > /tmp/test-email.js << EOF
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: '$GMAIL_USER',
        pass: '$GMAIL_PASS'
    }
});

const mailOptions = {
    from: 'Photonic Booth <$GMAIL_USER>',
    to: '$ALERT_TO',
    subject: 'Photonic Email Test',
    text: 'This is a test email from your Photonic Photo Booth system.\n\nIf you received this, email alerts are working correctly!'
};

transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.error('FAILED:', error.message);
        process.exit(1);
    } else {
        console.log('SUCCESS:', info.messageId);
        process.exit(0);
    }
});
EOF

# Run test
cd "$INSTALL_DIR/apps/backend"
if node /tmp/test-email.js 2>&1; then
    echo "✓ Test email sent successfully!"
    rm /tmp/test-email.js
else
    echo "✗ Test email failed!"
    echo "Please check your Gmail App Password and try again."
    rm /tmp/test-email.js
    exit 1
fi

# Add to .env
echo "" >> "$ENV_FILE"
echo "# Email Alerts (Auto-configured during installation)" >> "$ENV_FILE"
echo "SMTP_HOST=smtp.gmail.com" >> "$ENV_FILE"
echo "SMTP_PORT=587" >> "$ENV_FILE"
echo "SMTP_USER=$GMAIL_USER" >> "$ENV_FILE"
echo "SMTP_PASS=$GMAIL_PASS" >> "$ENV_FILE"
echo "ALERT_FROM=$GMAIL_USER" >> "$ENV_FILE"
echo "ALERT_TO=$ALERT_TO" >> "$ENV_FILE"

echo ""
echo "✓ Email alerts configured!"
echo "  From: $GMAIL_USER"
echo "  To: $ALERT_TO"
echo ""
echo "Alerts will be sent for:"
echo "  • Camera disconnections"
echo "  • Service crashes"
echo "  • Payment failures"
echo "  • Disk space warnings"
