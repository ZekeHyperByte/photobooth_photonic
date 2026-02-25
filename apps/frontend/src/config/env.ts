/**
 * Frontend environment configuration
 */

export const env = {
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:4000",
  liveViewTransport: (import.meta.env.VITE_LIVEVIEW_TRANSPORT || "http") as
    | "ipc"
    | "http",
  kioskMode: import.meta.env.VITE_KIOSK_MODE === "true",
};
