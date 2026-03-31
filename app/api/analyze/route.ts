import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { LRUCache } from 'lru-cache';

// Cache for 1 hour, max 100 items
const cache = new LRUCache<string, any>({
  max: 100,
  ttl: 1000 * 60 * 60,
});

const CREDIBILITY_SCORES: Record<string, number> = {
  'nytimes.com': 95,
  'reuters.com': 98,
  'apnews.com': 98,
  'bbc.com': 92,
  'wsj.com': 94,
  'theguardian.com': 90,
  'npr.org': 93,
  'infowars.com': 10,
  'breitbart.com': 30,
  'theonion.com': 5, // Satire
  'clickhole.com': 5, // Satire
};

async function scrapeUrl(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    if (!response.ok) throw new Error('Failed to fetch URL');
    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove scripts, styles, ads, navigation, footers, and other non-content elements
    $('script, style, nav, footer, iframe, noscript').remove();
    
    // Remove common ad containers and patterns
    $('ads, .ads, #ads, .advertisement, .Advertisement, [data-ad], [data-advert]').remove();
    $('.banner, .sponsored, .promo, .ad-container, .ad_container, #ad-container').remove();
    $('aside, .sidebar, .widget, .widgetbox, .widget-container').remove();
    
    // Remove specific ad network divs and classes
    $('[class*="ad-"], [class*="advertisement-"], [class*="sponsored-"], [class*="promo-"]').remove();
    $('[id*="ad-"], [id*="advertisement-"], [id*="sponsored-"]').remove();
    
    // Remove floating/sticky ad elements
    $('[style*="position: fixed"], [style*="position: sticky"]').remove();

    const title = $('h1').first().text().trim() || $('title').text().trim();
    
    // Try to find main content
    let content = '';
    $('article p, main p, .content p, #content p, .entry-content p, .post-content p').each((_, el) => {
      const text = $(el).text().trim();
      if (text) content += text + '\n';
    });

    // Fallback to all paragraphs if main content not found
    if (!content.trim().length) {
      $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 15) { // Filter out very short paragraphs (likely nav/ad text)
          content += text + '\n';
        }
      });
    }

    // Clean up excessive whitespace
    content = content.replace(/\n\n+/g, '\n').trim();

    // Ensure we have meaningful content (minimum 200 chars)
    if (content.length < 200) {
      console.warn('Scraped content is very short, may indicate extraction failure');
    }

    return { title, content: content.slice(0, 5000) }; // Limit to 5000 chars
  } catch (error) {
    console.error('Scraping error:', error);
    throw new Error('Could not extract content from URL');
  }
}

function getDomainCredibility(url: string) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const score = CREDIBILITY_SCORES[domain] || 50; // Default 50 for unknown
    return { domain, score };
  } catch {
    return { domain: 'unknown', score: 0 };
  }
}

export async function POST(req: Request) {
  try {
    const { text, url } = await req.json();

    if (!text && !url) {
      return NextResponse.json({ error: 'Text or URL is required' }, { status: 400 });
    }

    const cacheKey = url || text.slice(0, 100);
    if (cache.has(cacheKey)) {
      return NextResponse.json(cache.get(cacheKey));
    }

    let contentToAnalyze = text;
    let sourceInfo = null;

    if (url) {
      const scraped = await scrapeUrl(url);
      contentToAnalyze = `Title: ${scraped.title}\n\nContent: ${scraped.content}`;
      sourceInfo = getDomainCredibility(url);
    }

    const response = {
      contentToAnalyze,
      sourceInfo,
      timestamp: new Date().toISOString(),
    };

    cache.set(cacheKey, response);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
