import { NextResponse } from 'next/server';
import { getHealthStatus, getUsageStats } from '@/lib/api-key-manager';

/**
 * GET /api/health
 * Returns the health status of all API keys and system configuration
 * Use this to monitor API key rotation and usage rates
 */
export async function GET() {
  try {
    const health = getHealthStatus();
    const groqStats = getUsageStats('groq');
    const tavilyStats = getUsageStats('tavily');

    return NextResponse.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      apiKeys: {
        groq: {
          healthy: health.groq.healthy,
          message: health.groq.message,
          activeKeyIndex: health.groq.activeKeyIndex,
          totalKeys: health.groq.totalKeys,
          stats: groqStats.keys
        },
        tavily: {
          healthy: health.tavily.healthy,
          message: health.tavily.message,
          activeKeyIndex: health.tavily.activeKeyIndex,
          totalKeys: health.tavily.totalKeys,
          stats: tavilyStats.keys
        }
      },
      systemStatus: {
        allHealthy: health.groq.healthy && health.tavily.healthy,
        warnings: !health.groq.healthy ? ['Groq API approaching rate limit'] : [],
        ...(!health.tavily.healthy && {
          warnings: ['Tavily API approaching rate limit']
        })
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: error.message || 'Failed to retrieve health status'
      },
      { status: 500 }
    );
  }
}
