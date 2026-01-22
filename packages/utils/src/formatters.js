/**
 * Utility functions for formatting data
 */
/**
 * Format currency (Indonesian Rupiah)
 */
export function formatCurrency(amount, currency = 'IDR') {
    if (currency === 'IDR') {
        return `Rp ${amount.toLocaleString('id-ID')}`;
    }
    return `${currency} ${amount.toLocaleString()}`;
}
/**
 * Format phone number to Indonesian format
 */
export function formatPhoneNumber(phone) {
    // Remove any non-digit characters
    const digits = phone.replace(/\D/g, '');
    // Convert to +62 format if starts with 0
    if (digits.startsWith('0')) {
        return '+62' + digits.slice(1);
    }
    // Add +62 if not present
    if (!digits.startsWith('62')) {
        return '+62' + digits;
    }
    // Add + if not present
    if (!digits.startsWith('+')) {
        return '+' + digits;
    }
    return digits;
}
/**
 * Format date to Indonesian locale
 */
export function formatDate(date, includeTime = false) {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (includeTime) {
        return d.toLocaleString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    return d.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}
/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds) {
    if (seconds < 60) {
        return `${seconds} detik`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
        return remainingSeconds > 0
            ? `${minutes} menit ${remainingSeconds} detik`
            : `${minutes} menit`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
        ? `${hours} jam ${remainingMinutes} menit`
        : `${hours} jam`;
}
/**
 * Generate order ID with timestamp
 */
export function generateOrderId(prefix = 'ORD') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
}
/**
 * Generate file name with timestamp
 */
export function generateFileName(prefix, extension) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}.${extension}`;
}
/**
 * Sanitize filename by removing special characters
 */
export function sanitizeFileName(filename) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}
/**
 * Truncate text to specified length
 */
export function truncate(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return text.substring(0, maxLength - 3) + '...';
}
/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Retry a function with exponential backoff
 */
export async function retry(fn, options = {}) {
    const { maxAttempts = 3, delayMs = 1000, exponential = true } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                const delay = exponential ? delayMs * Math.pow(2, attempt - 1) : delayMs;
                await sleep(delay);
            }
        }
    }
    throw lastError;
}
/**
 * Create a debounced function
 */
export function debounce(func, waitMs) {
    let timeoutId = null;
    return function (...args) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func(...args);
        }, waitMs);
    };
}
/**
 * Parse pagination parameters
 */
export function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}
/**
 * Calculate pagination metadata
 */
export function calculatePagination(total, page, limit) {
    const pages = Math.ceil(total / limit);
    const hasNextPage = page < pages;
    const hasPrevPage = page > 1;
    return {
        total,
        page,
        pages,
        limit,
        hasNextPage,
        hasPrevPage,
    };
}
