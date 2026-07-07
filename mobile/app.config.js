const base = require('./app.json');

const APP_ORIGIN = (
  process.env.EXPO_PUBLIC_APP_URL ?? 'https://staging.locumlink.ca'
).replace(/\/$/, '');
const APP_HOST = new URL(APP_ORIGIN).hostname;

/** App Links / intent filters: only the host for this build (staging OR prod, never both). */
const oauthIntentFilter = {
  action: 'VIEW',
  autoVerify: true,
  data: [
    {
      scheme: 'https',
      host: APP_HOST,
      pathPrefix: '/auth/callback',
    },
  ],
  category: ['BROWSABLE', 'DEFAULT'],
};

module.exports = {
  expo: {
    ...base.expo,
    android: {
      ...base.expo.android,
      intentFilters: [oauthIntentFilter],
    },
  },
};
