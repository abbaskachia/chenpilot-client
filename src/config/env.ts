// Environment configuration for ChenPilot client

export const env = {
  // API Configuration
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2333',

  // Horizon proxy — routes through backend's /proxy pipeline
  HORIZON_PROXY_URL: typeof window !== 'undefined'
    ? `${window.location.origin}/horizon`
    : '/horizon',

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',

  // Application Configuration
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'ChenPilot',
  APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK || '',

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_TEST: process.env.NODE_ENV === 'test',
} as const;

// Validate required environment variables
export const validateEnv = () => {
  const required = [
    'NEXT_PUBLIC_API_BASE_URL',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    const missingKeys = missing.join(', ');
    throw new Error(
      `[Env Config Error] Missing required environment variable(s): ${missingKeys}.\n` +
      `Please create or update your '.env.local' file in the project root with valid settings (e.g. NEXT_PUBLIC_API_BASE_URL=http://localhost:2333).\n` +
      `For help troubleshooting environment configuration, see docs/TROUBLESHOOTING.md.`
    );
  }
};

// Initialize environment validation
if (typeof window === 'undefined') {
  validateEnv();
}
