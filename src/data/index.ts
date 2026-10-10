import type { Backend } from "./backend";
import { createDemoBackend } from "./demoBackend";

const env = import.meta.env;

/** Uses the demo backend when Firebase isn't configured, or when the URL has ?demo. */
export async function createBackend(): Promise<Backend> {
  const wantsDemo = new URLSearchParams(location.search).has("demo");
  if (!wantsDemo && env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    const { createFirebaseBackend } = await import("./firebaseBackend");
    return createFirebaseBackend(
      {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      },
      env.VITE_FIREBASE_VAPID_KEY,
    );
  }
  return createDemoBackend();
}
