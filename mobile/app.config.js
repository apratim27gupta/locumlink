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

const isDevClientBuild = process.env.EAS_BUILD_PROFILE === 'development';

function resolvePlugins() {
  const plugins = base.expo.plugins ?? [];
  return plugins.filter((plugin) => {
    const name = typeof plugin === 'string' ? plugin : plugin[0];
    return isDevClientBuild || name !== 'expo-dev-client';
  });
}

module.exports = {
  expo: {
    ...base.expo,
    plugins: resolvePlugins(),
    ios: {
      ...base.expo.ios,
      usesAppleSignIn: true,
      entitlements: {
        'com.apple.developer.applesignin': ['Default'],
      },
    },
    android: {
      ...base.expo.android,
      intentFilters: [oauthIntentFilter],
    },
  },
};
