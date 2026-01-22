// Check if we're in a Node.js environment
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
/**
 * Create a logger instance with consistent formatting
 * In browser environments, returns a console-based logger
 * In Node.js environments, returns a Winston logger
 */
export function createLogger(service) {
    // Browser environment - use console
    if (!isNode) {
        return {
            debug: (...args) => console.debug(`[${service}]`, ...args),
            info: (...args) => console.info(`[${service}]`, ...args),
            warn: (...args) => console.warn(`[${service}]`, ...args),
            error: (...args) => console.error(`[${service}]`, ...args),
        };
    }
    // Node.js environment - use Winston
    const winston = require('winston');
    const { isDevelopment } = require('@photonic/config');
    const format = winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.errors({ stack: true }), winston.format.splat(), winston.format.json());
    const consoleFormat = winston.format.combine(winston.format.colorize(), winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
        let msg = `${timestamp} [${service}] ${level}: ${message}`;
        if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
    }));
    const logger = winston.createLogger({
        level: isDevelopment() ? 'debug' : 'info',
        format,
        defaultMeta: { service },
        transports: [
            // Console output
            new winston.transports.Console({
                format: consoleFormat,
            }),
        ],
    });
    // Add file transports in production
    if (!isDevelopment()) {
        logger.add(new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
        }));
        logger.add(new winston.transports.File({
            filename: 'logs/combined.log',
        }));
    }
    return logger;
}
/**
 * Default logger instance
 */
export const logger = createLogger('photonic');
