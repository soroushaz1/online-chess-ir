export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://playonlinechess.ir"
).replace(/\/$/, "");

export const APP_AUTH_REDIRECT_URI = "onlinechess://auth";