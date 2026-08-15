import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pocketwire.app",
  appName: "pocketwire",
  webDir: "../packages/web/public",
  backgroundColor: "#0b0e14",
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
