import type { CapacitorConfig } from '@capacitor/cli';

// TaskFlow Android: loads the production web app in a native shell.
// Web code stays the single source of truth; native features (back button,
// notifications, push) are bridged from apps/web/src/lib/capacitor.ts.
const PROD_URL = 'https://task-flow-wheat-sigma.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.taskflow.app',
  appName: 'TaskFlow',
  webDir: 'capacitor-www',
  server: {
    url: `${PROD_URL}/app`,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#3B82F6',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
