import Groq from 'groq-sdk';
import { tavily } from '@tavily/core';
import { getApiKey, initializeApiKeys, recordApiUsage } from './api-key-manager';
import { getApiConfig } from './api-config';

// Initialize API key manager at startup
initializeApiKeys({
  groq: parseInt(process.env.GROQ_DAILY_LIMIT || '1000', 10),
  tavily: parseInt(process.env.TAVILY_DAILY_LIMIT || '500', 10)
});

/**
 * Create Groq client with the current active API key
 * The key is obtained from the API Key Manager which handles rotation
 */
function createGroqClient(): Groq {
  const apiKey = getApiKey('groq');
  return new Groq({ apiKey });
}

/**
 * Create Tavily client with the current active API key
 */
function createTavilyClient() {
  const apiKey = getApiKey('tavily');
  return tavily({ apiKey });
}

// Export lazy-initialized clients (keys are determined at first use)
let groqInstance: Groq | null = null;
let tavilyInstance: ReturnType<typeof tavily> | null = null;

export function getGroqClient(): Groq {
  if (!groqInstance) {
    groqInstance = createGroqClient();
  }
  return groqInstance;
}

export function getTavilyClient() {
  if (!tavilyInstance) {
    tavilyInstance = createTavilyClient();
  }
  return tavilyInstance;
}

/**
 * Get a fresh API key (forces re-evaluation and potential rotation)
 */
export function refreshGroqClient(): Groq {
  groqInstance = createGroqClient();
  return groqInstance;
}

export function refreshTavilyClient() {
  tavilyInstance = createTavilyClient();
  return tavilyInstance;
}

// For backward compatibility, export default clients
export const groq = new Proxy(new Groq({ apiKey: 'dummy' }), {
  get(target, prop) {
    return Reflect.get(getGroqClient(), prop);
  }
});

export const tavilyClient = new Proxy({}, {
  get(target, prop) {
    return Reflect.get(getTavilyClient(), prop);
  }
});

// Enhanced verdict categories
export type VerdictType = 'VERIFIED' | 'PARTIALLY_TRUE' | 'SPECULATIVE' | 'MISLEADING' | 'FABRICATED';

// Speculation pattern detection
const SPECULATION_PATTERNS = [
  'expected to',
  'likely to',
  'may launch',
  'rumored',
  'according to reports',
  'according to sources',
  'is reported to',
  'said to be',
  'could be',
  'might',
  'alleged',
  'unconfirmed',
  'supposedly',
  'appears to',
  'seems to',
  'expected',
  'predicted',
  'forecasted',
  'planned to',
  'will likely'
];

export function detectSpeculationLevel(text: string): number {
  const lowerText = text.toLowerCase();
  let speculationCount = 0;
  const textLength = text.split(' ').length;

  SPECULATION_PATTERNS.forEach(pattern => {
    const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) speculationCount += matches.length;
  });

  // Normalize to 0-100 scale
  const speculationLevel = Math.min(100, (speculationCount / Math.max(textLength / 10, 1)) * 100);
  return Math.round(speculationLevel);
}

export const ANALYSIS_SCHEMA = {
  type: 'object' as const,
  properties: {
    verdict: {
      type: 'string',
      description: "One of: VERIFIED, PARTIALLY_TRUE, SPECULATIVE, MISLEADING, FABRICATED",
    },
    confidence: {
      type: 'number',
      description: 'Overall confidence score from 0 to 100 (calibrated for uncertainty)',
    },
    scores: {
      type: 'object',
      properties: {
        source_credibility: { type: 'number', description: 'Source credibility 0-100' },
        claim_verifiability: { type: 'number', description: 'How verifiable claims are 0-100' },
        evidence_strength: { type: 'number', description: 'Strength of supporting evidence 0-100' },
        speculation_level: { type: 'number', description: 'Amount of speculation 0-100' },
        overall_trust_score: { type: 'number', description: 'Combined trust assessment 0-100' }
      }
    },
    explanation: {
      type: 'string',
      description: 'Detailed explanation of the verdict with reasoning'
    },
    claim_analysis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string', description: 'The specific claim' },
          status: { type: 'string', description: 'verified, unverified, or speculative' },
          evidence: { type: 'string', description: 'Supporting or refuting evidence' },
          confidence: { type: 'number', description: 'Confidence in this claims status 0-100' }
        }
      },
      description: 'Breakdown of individual claims and their verification status'
    },
    suspiciousSentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          reason: { type: 'string' },
          severity: { type: 'string', description: 'LOW, MEDIUM, HIGH' }
        }
      }
    },
    bias: {
      type: 'string',
      description: 'Political bias: Left, Center-Left, Center, Center-Right, Right, or Neutral'
    },
    sentiment: {
      type: 'string',
      description: 'Overall sentiment: Positive, Negative, or Neutral'
    },
    key_claims: {
      type: 'array',
      items: { type: 'string' },
      description: 'Main claims made in the article'
    },
    // Backward compatibility with old format
    prediction: {
      type: 'string',
      description: 'Legacy field: REAL (VERIFIED), FAKE (FABRICATED), or PARTIAL (PARTIALLY_TRUE/SPECULATIVE)'
    }
  },
  required: ['verdict', 'confidence', 'scores', 'explanation', 'claim_analysis']
};

// Helper function to extract key claims from text for web search
export function extractKeyClaimsForSearch(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const factualSentences = sentences
    .filter(s => {
      const lower = s.toLowerCase();
      return (lower.includes('is') || lower.includes('was') || 
              lower.includes('says') || lower.includes('claims') ||
              lower.includes('announced') || lower.includes('reported'));
    })
    .slice(0, 3)
    .map(s => s.trim());
  
  return factualSentences.length > 0 ? factualSentences : [text.slice(0, 200)];
}

// Interface for search results
export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

// Search for information about claims in the text
export async function searchForEvidence(text: string, title?: string): Promise<SearchResult[]> {
  try {
    const claims = extractKeyClaimsForSearch(text);
    let searchQuery = title 
      ? `${title} fact check` 
      : claims[0] || text.slice(0, 100);

    // Limit query to 400 characters (Tavily max)
    if (searchQuery.length > 400) {
      searchQuery = searchQuery.slice(0, 397) + '...';
    }

    // Get the current active Tavily client (handles API key rotation internally)
    const client = getTavilyClient();
    const response = await client.search(searchQuery, {
      includeAnswer: true,
      maxResults: 5,
    });

    // Record API usage for rate limiting
    recordApiUsage('tavily');

    return response.results.map((result: any) => ({
      title: result.title,
      url: result.url,
      content: result.content || result.snippet || '',
    }));
  } catch (error) {
    console.error('Tavily search error:', error);
    return [];
  }
}

// Format search results into context for AI analysis
export function formatSearchResultsContext(results: SearchResult[]): string {
  if (results.length === 0) return '';
  
  return '\n\nWeb Search Context:\n' + results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nContent: ${r.content.slice(0, 300)}`)
    .join('\n\n');
}
