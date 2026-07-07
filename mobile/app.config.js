const base = require('./app.json');

const APP_ORIGIN = (
  process.env.EXPO_PUBLIC_APP_URL ?? 'https://staging.locumlink.ca'
).replace(/\/$/, '');
const APP_HOST = new URL(APP_ORIGIN).hostname;
const PROD_HOST = 'locumlink.ca';

/** Staging also registers prod callback host so Supabase Site URL misdirects can be remapped. */
const oauthHosts =
  APP_HOST === 'staging.locumlink.ca' ? [APP_HOST, PROD_HOST] : [APP_HOST];

const oauthIntentFilter = {
  action: 'VIEW',
  autoVerify: true,
  data: oauthHosts.map((host) => ({
    scheme: 'https',
    host,
    pathPrefix: '/auth/callback',
  })),
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
