/**
 * API Configuration Validator
 * Ensures all required API keys are configured and validates environment setup
 */

interface ApiConfig {
  groq: {
    keys: string[];
    dailyLimit: number;
  };
  tavily: {
    keys: string[];
    dailyLimit: number;
  };
  gemini: {
    key: string;
  };
  appUrl: string;
  environment: 'development' | 'production';
}

/**
 * Validate and load API configuration from environment
 */
export function loadApiConfig(): ApiConfig {
  const errors: string[] = [];

  // Collect Groq API keys
  const groqKeys: string[] = [];
  let groqIndex = 1;
  while (process.env[`GROQ_API_KEY_${groqIndex}`]) {
    groqKeys.push(process.env[`GROQ_API_KEY_${groqIndex}`]!);
    groqIndex++;
  }
  if (groqKeys.length === 0 && process.env.GROQ_API_KEY) {
    groqKeys.push(process.env.GROQ_API_KEY);
  }
  if (groqKeys.length === 0) {
    errors.push('❌ Missing Groq API key(s). Set GROQ_API_KEY_1 or GROQ_API_KEY in .env.local');
  }

  // Collect Tavily API keys
  const tavilyKeys: string[] = [];
  let tavilyIndex = 1;
  while (process.env[`TAVILY_API_KEY_${tavilyIndex}`]) {
    tavilyKeys.push(process.env[`TAVILY_API_KEY_${tavilyIndex}`]!);
    tavilyIndex++;
  }
  if (tavilyKeys.length === 0 && process.env.TAVILY_API_KEY) {
    tavilyKeys.push(process.env.TAVILY_API_KEY);
  }
  if (tavilyKeys.length === 0) {
    errors.push('❌ Missing Tavily API key(s). Set TAVILY_API_KEY_1 or TAVILY_API_KEY in .env.local');
  }

  // Validate Gemini API key (backend only, not NEXT_PUBLIC_)
  const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!geminiKey) {
    errors.push('❌ Missing Gemini API key. Set GEMINI_API_KEY in .env.local');
  }

  // Validate APP_URL
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    errors.push('❌ Missing APP_URL. Set APP_URL in .env.local');
  }

  // Check for security issue: NEXT_PUBLIC_GEMINI_API_KEY should not be used
  if (process.env.NEXT_PUBLIC_GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
    console.warn(
      '⚠️ SECURITY WARNING: Found NEXT_PUBLIC_GEMINI_API_KEY. This exposes the API key to the browser.'
    );
    console.warn('   Use GEMINI_API_KEY instead (backend-only). NEXT_PUBLIC_ should only be for public keys.');
  }

  if (errors.length > 0) {
    console.error('\n🔴 API Configuration Errors:\n');
    errors.forEach((error) => console.error(error));
    console.error('\nPlease ensure .env.local is correctly configured.\n');
    throw new Error('API configuration validation failed');
  }

  const config: ApiConfig = {
    groq: {
      keys: groqKeys,
      dailyLimit: parseInt(process.env.GROQ_DAILY_LIMIT || '1000', 10)
    },
    tavily: {
      keys: tavilyKeys,
      dailyLimit: parseInt(process.env.TAVILY_DAILY_LIMIT || '500', 10)
    },
    gemini: {
      key: geminiKey!
    },
    appUrl: appUrl!,
    environment: (process.env.NODE_ENV as 'development' | 'production') || 'development'
  };

  // Log configuration summary
  console.log('\n✅ API Configuration Loaded:');
  console.log(`   • Groq: ${config.groq.keys.length} key(s), ${config.groq.dailyLimit} requests/day`);
  console.log(`   • Tavily: ${config.tavily.keys.length} key(s), ${config.tavily.dailyLimit} requests/day`);
  console.log(`   • Gemini: ✓ Configured (backend-only)`);
  console.log(`   • Environment: ${config.environment}`);
  console.log(`   • App URL: ${config.appUrl}\n`);

  return config;
}

/**
 * Get current API config (cached)
 */
let cachedConfig: ApiConfig | null = null;

export function getApiConfig(): ApiConfig {
  if (!cachedConfig) {
    cachedConfig = loadApiConfig();
  }
  return cachedConfig;
}

/**
 * Validate request payload size to prevent abuse
 */
export function validateRequestPayload(
  contentLength: number,
  maxSize: number = 1024 * 1024 // 1MB default
): boolean {
  return contentLength <= maxSize;
}
