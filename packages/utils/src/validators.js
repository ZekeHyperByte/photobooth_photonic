import { z } from 'zod';
import { VALIDATION } from '@photonic/config';
// ============================================================================
// Common Schemas
// ============================================================================
export const uuidSchema = z.string().uuid();
// Flexible ID schema for nanoid/UUID formats
export const idSchema = z.string().min(1);
export const phoneNumberSchema = z
    .string()
    .regex(VALIDATION.PHONE_REGEX, 'Invalid phone number format');
export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
// ============================================================================
// Session Schemas
// ============================================================================
export const createSessionSchema = z.object({
    packageId: idSchema,
});
// ============================================================================
// Payment Schemas
// ============================================================================
export const createPaymentSchema = z.object({
    sessionId: idSchema,
    phoneNumber: phoneNumberSchema.optional(),
});
export const verifyPaymentSchema = z.object({
    orderId: z.string().min(1),
});
// ============================================================================
// Photo Schemas
// ============================================================================
export const capturePhotoSchema = z.object({
    sessionId: idSchema,
    templateId: idSchema.optional(),
    filterId: idSchema.optional(),
});
export const processPhotoSchema = z.object({
    templateId: idSchema.optional(),
    filterId: idSchema.optional(),
});
export const sendWhatsAppSchema = z.object({
    phoneNumber: phoneNumberSchema,
});
export const queuePrintSchema = z.object({
    copies: z.number().int().min(1).max(10).default(1),
});
// ============================================================================
// Package Schemas
// ============================================================================
export const createPackageSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    photoCount: z.number().int().min(VALIDATION.MIN_PHOTO_COUNT).max(VALIDATION.MAX_PHOTO_COUNT),
    price: z.number().int().min(VALIDATION.MIN_PRICE),
    currency: z.string().default('IDR'),
    displayOrder: z.number().int().default(0),
});
export const updatePackageSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    photoCount: z
        .number()
        .int()
        .min(VALIDATION.MIN_PHOTO_COUNT)
        .max(VALIDATION.MAX_PHOTO_COUNT)
        .optional(),
    price: z.number().int().min(VALIDATION.MIN_PRICE).optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
});
// ============================================================================
// Template Schemas
// ============================================================================
export const templatePositionSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    zIndex: z.number().optional(),
});
export const multiZonePositionSchema = z.object({
    photoZones: z.array(templatePositionSchema).min(1).max(10),
});
export const createTemplateSchema = z.object({
    name: z.string().min(1).max(VALIDATION.MAX_TEMPLATE_NAME_LENGTH),
    description: z.string().max(500).optional(),
    templateType: z.enum(['overlay', 'frame', 'background']),
    positionData: z.union([templatePositionSchema, multiZonePositionSchema]).optional(),
    displayOrder: z.number().int().default(0),
});
export const updateTemplateSchema = z.object({
    name: z.string().min(1).max(VALIDATION.MAX_TEMPLATE_NAME_LENGTH).optional(),
    description: z.string().max(500).optional(),
    positionData: z.union([templatePositionSchema, multiZonePositionSchema]).optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
});
// ============================================================================
// Filter Schemas
// ============================================================================
export const filterConfigSchema = z.object({
    brightness: z.number().min(0).max(2).optional(),
    contrast: z.number().min(0).max(2).optional(),
    saturation: z.number().min(0).max(2).optional(),
    grayscale: z.boolean().optional(),
    sepia: z.boolean().optional(),
    blur: z.number().min(0).max(10).optional(),
    sharpen: z.number().min(0).max(10).optional(),
}).passthrough(); // Allow additional Sharp filter properties
export const createFilterSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    filterConfig: filterConfigSchema,
    displayOrder: z.number().int().default(0),
});
// ============================================================================
// Admin Schemas
// ============================================================================
export const adminLoginSchema = z.object({
    password: z.string().min(VALIDATION.MIN_PASSWORD_LENGTH),
});
export const analyticsQuerySchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
});
export const transactionListQuerySchema = paginationSchema.extend({
    status: z.enum(['pending', 'success', 'failed', 'expired']).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});
export const updateSettingsSchema = z.record(z.string());
// ============================================================================
// Camera Schemas
// ============================================================================
export const cameraCaptureSchema = z.object({
    sessionId: idSchema,
    sequenceNumber: z.number().int().min(1),
});
export const configureCameraSchema = z.object({
    iso: z.string().optional(),
    shutterSpeed: z.string().optional(),
    aperture: z.string().optional(),
    whiteBalance: z.string().optional(),
});
// ============================================================================
// Validation Helper Functions
// ============================================================================
/**
 * Validate data against a Zod schema
 * Throws an error if validation fails
 */
export function validate(schema, data) {
    return schema.parse(data);
}
/**
 * Safely validate data against a Zod schema
 * Returns validation result without throwing
 */
export function safeValidate(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
/**
 * Format Zod validation errors for API responses
 */
export function formatValidationErrors(error) {
    const formatted = {};
    for (const issue of error.issues) {
        const path = issue.path.join('.');
        if (!formatted[path]) {
            formatted[path] = [];
        }
        formatted[path].push(issue.message);
    }
    return formatted;
}
/**
 * Check if a string is a valid UUID
 */
export function isUuid(value) {
    return uuidSchema.safeParse(value).success;
}
/**
 * Check if a string is a valid phone number
 */
export function isValidPhoneNumber(value) {
    return phoneNumberSchema.safeParse(value).success;
}
