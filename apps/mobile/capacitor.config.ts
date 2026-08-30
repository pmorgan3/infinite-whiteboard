import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.whiteboard.app',
  appName: 'Infinite Whiteboard',
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;