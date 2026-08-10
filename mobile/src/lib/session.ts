import * as SecureStore from "expo-secure-store";

const MOBILE_SESSION_KEY = "online_chess_mobile_session";

export async function getMobileSessionToken() {
  return SecureStore.getItemAsync(MOBILE_SESSION_KEY);
}

export async function setMobileSessionToken(token: string) {
  await SecureStore.setItemAsync(MOBILE_SESSION_KEY, token);
}

export async function clearMobileSessionToken() {
  await SecureStore.deleteItemAsync(MOBILE_SESSION_KEY);
}
