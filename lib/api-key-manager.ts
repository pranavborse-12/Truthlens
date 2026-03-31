/**
 * API Key Manager
 * Manages multiple API keys with usage tracking and automatic rotation
 * Switches to next key when approaching rate limits
 * Monitors renewal and switches back to first key when appropriate
 */

interface ApiKeyConfig {
  key: string;
  usageCount: number;
  dailyLimit: number;
  lastResetTime: number;
  isActive: boolean;
}

interface ApiKeyStore {
  groq: ApiKeyConfig[];
  tavily: ApiKeyConfig[];
}

let keyStore: ApiKeyStore = {
  groq: [],
  tavily: []
};

let initialized = false;

/**
 * Initialize API keys from environment variables
 * Convention: GROQ_API_KEY_1, GROQ_API_KEY_2, etc.
 *            TAVILY_API_KEY_1, TAVILY_API_KEY_2, etc.
 */
export function initializeApiKeys(limits: { groq: number; tavily: number } = { groq: 1000, tavily: 500 }) {
  if (initialized) return;

  try {
    // Initialize Groq keys
    let groqIndex = 1;
    while (process.env[`GROQ_API_KEY_${groqIndex}`]) {
      const key = process.env[`GROQ_API_KEY_${groqIndex}`]!;
      keyStore.groq.push({
        key,
        usageCount: 0,
        dailyLimit: limits.groq,
        lastResetTime: Date.now(),
        isActive: groqIndex === 1
      });
      groqIndex++;
    }

    // Initialize Tavily keys
    let tavilyIndex = 1;
    while (process.env[`TAVILY_API_KEY_${tavilyIndex}`]) {
      const key = process.env[`TAVILY_API_KEY_${tavilyIndex}`]!;
      keyStore.tavily.push({
        key,
        usageCount: 0,
        dailyLimit: limits.tavily,
        lastResetTime: Date.now(),
        isActive: tavilyIndex === 1
      });
      tavilyIndex++;
    }

    // Fallback for single key configuration (backward compatibility)
    if (keyStore.groq.length === 0 && process.env.GROQ_API_KEY) {
      keyStore.groq.push({
        key: process.env.GROQ_API_KEY,
        usageCount: 0,
        dailyLimit: limits.groq,
        lastResetTime: Date.now(),
        isActive: true
      });
    }

    if (keyStore.tavily.length === 0 && process.env.TAVILY_API_KEY) {
      keyStore.tavily.push({
        key: process.env.TAVILY_API_KEY,
        usageCount: 0,
        dailyLimit: limits.tavily,
        lastResetTime: Date.now(),
        isActive: true
      });
    }

    if (keyStore.groq.length === 0) {
      throw new Error(
        'No Groq API keys configured. Set GROQ_API_KEY or GROQ_API_KEY_1, GROQ_API_KEY_2, etc. in .env.local'
      );
    }

    if (keyStore.tavily.length === 0) {
      throw new Error(
        'No Tavily API keys configured. Set TAVILY_API_KEY or TAVILY_API_KEY_1, TAVILY_API_KEY_2, etc. in .env.local'
      );
    }

    console.log(`✅ Initialized ${keyStore.groq.length} Groq API key(s)`);
    console.log(`✅ Initialized ${keyStore.tavily.length} Tavily API key(s)`);

    initialized = true;
  } catch (error) {
    console.error('❌ Failed to initialize API keys:', error);
    throw error;
  }
}

/**
 * Check if daily limit has been reset (24 hours passed)
 */
function shouldResetDailyLimit(lastResetTime: number): boolean {
  return Date.now() - lastResetTime > 24 * 60 * 60 * 1000;
}

/**
 * Get the next available API key and track usage
 * Automatically rotates to next key when current approaches limit
 */
export function getApiKey(service: 'groq' | 'tavily'): string {
  if (!initialized) {
    initializeApiKeys();
  }

  const keys = keyStore[service];

  if (keys.length === 0) {
    throw new Error(`No ${service.toUpperCase()} API keys available`);
  }

  // Reset daily counters if 24 hours have passed
  keys.forEach((config) => {
    if (shouldResetDailyLimit(config.lastResetTime)) {
      console.log(`🔄 Reset daily limit for ${service.toUpperCase()} key (24h passed)`);
      config.usageCount = 0;
      config.lastResetTime = Date.now();
    }
  });

  // Find first key that is active and below threshold (80% of limit)
  const thresholdUsage = keys[0].dailyLimit * 0.8;

  // Check if current active key needs rotation
  const activeKeyIndex = keys.findIndex((k) => k.isActive);
  const activeKey = keys[activeKeyIndex];

  if (activeKey && activeKey.usageCount < thresholdUsage) {
    activeKey.usageCount++;
    return activeKey.key;
  }

  // Current key is approaching limit, try to rotate to next available key
  for (let i = activeKeyIndex + 1; i < keys.length; i++) {
    if (keys[i].usageCount < keys[i].dailyLimit * 0.9) {
      // Deactivate current key
      keys[activeKeyIndex].isActive = false;

      // Activate next key
      keys[i].isActive = true;

      console.log(`🔄 [${new Date().toISOString()}] Rotated ${service.toUpperCase()} API key: #${activeKeyIndex + 1} → #${i + 1}`);

      keys[i].usageCount++;
      return keys[i].key;
    }
  }

  // All keys hitting limit, check if first key can be reused (24h reset)
  if (activeKeyIndex > 0 && shouldResetDailyLimit(keys[0].lastResetTime)) {
    keys[0].usageCount = 0;
    keys[0].lastResetTime = Date.now();
    keys[activeKeyIndex].isActive = false;
    keys[0].isActive = true;

    console.log(`🔄 [${new Date().toISOString()}] Reset & switched back to ${service.toUpperCase()} key #1`);

    keys[0].usageCount++;
    return keys[0].key;
  }

  // All keys are at limit, log warning and return first key anyway
  const usagePercent = (activeKey.usageCount / activeKey.dailyLimit) * 100;
  console.warn(`⚠️ ${service.toUpperCase()} API key #${activeKeyIndex + 1} at ${usagePercent.toFixed(0)}% usage (${activeKey.usageCount}/${activeKey.dailyLimit})`);

  activeKey.usageCount++;
  return activeKey.key;
}

/**
 * Record API usage for tracking purposes
 */
export function recordApiUsage(service: 'groq' | 'tavily'): void {
  if (!initialized) {
    return;
  }

  const keys = keyStore[service];
  const activeKey = keys.find((k) => k.isActive);

  if (activeKey) {
    const usagePercent = (activeKey.usageCount / activeKey.dailyLimit) * 100;

    if (usagePercent > 90) {
      console.warn(
        `⚠️ ${service.toUpperCase()} API key usage at ${usagePercent.toFixed(0)}% (${activeKey.usageCount}/${activeKey.dailyLimit})`
      );
    }
  }
}

/**
 * Get current usage stats for all API keys
 */
export function getUsageStats(service: 'groq' | 'tavily'): {
  service: string;
  keys: Array<{
    keyIndex: number;
    usageCount: number;
    dailyLimit: number;
    usagePercent: number;
    isActive: boolean;
    hoursUntilReset: number;
  }>;
} {
  if (!initialized) {
    initializeApiKeys();
  }

  const keys = keyStore[service];
  return {
    service,
    keys: keys.map((config, index) => {
      const usagePercent = (config.usageCount / config.dailyLimit) * 100;
      const hoursUntilReset = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - config.lastResetTime)) / (60 * 60 * 1000));

      return {
        keyIndex: index + 1,
        usageCount: config.usageCount,
        dailyLimit: config.dailyLimit,
        usagePercent: Math.round(usagePercent),
        isActive: config.isActive,
        hoursUntilReset: Math.max(0, hoursUntilReset)
      };
    })
  };
}

/**
 * Get health status of all API keys
 */
export function getHealthStatus(): {
  groq: {
    healthy: boolean;
    message: string;
    activeKeyIndex: number;
    totalKeys: number;
  };
  tavily: {
    healthy: boolean;
    message: string;
    activeKeyIndex: number;
    totalKeys: number;
  };
} {
  if (!initialized) {
    initializeApiKeys();
  }

  const groqStatus = getUsageStats('groq');
  const tavilyStatus = getUsageStats('tavily');

  const groqActiveKey = groqStatus.keys.find((k) => k.isActive);
  const tavilyActiveKey = tavilyStatus.keys.find((k) => k.isActive);

  const groqActiveIndex = groqActiveKey ? groqActiveKey.keyIndex : 1;
  const tavilyActiveIndex = tavilyActiveKey ? tavilyActiveKey.keyIndex : 1;

  return {
    groq: {
      healthy: groqStatus.keys.some((k) => k.usagePercent < 80),
      message: `Using key #${groqActiveIndex}/${groqStatus.keys.length} (${groqActiveKey?.usagePercent || 0}% usage)`,
      activeKeyIndex: groqActiveIndex,
      totalKeys: groqStatus.keys.length
    },
    tavily: {
      healthy: tavilyStatus.keys.some((k) => k.usagePercent < 80),
      message: `Using key #${tavilyActiveIndex}/${tavilyStatus.keys.length} (${tavilyActiveKey?.usagePercent || 0}% usage)`,
      activeKeyIndex: tavilyActiveIndex,
      totalKeys: tavilyStatus.keys.length
    }
  };
}
