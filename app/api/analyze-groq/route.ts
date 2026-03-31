import { NextResponse } from 'next/server';
import { getGroqClient, ANALYSIS_SCHEMA, searchForEvidence, formatSearchResultsContext, detectSpeculationLevel } from '@/lib/groq-tavily';
import { recordApiUsage, getHealthStatus } from '@/lib/api-key-manager';

export async function POST(req: Request) {
  try {
    const { contentToAnalyze, sourceType = 'text' } = await req.json();

    if (!contentToAnalyze) {
      return NextResponse.json({ error: 'Content to analyze is required' }, { status: 400 });
    }

    // Pre-analyze speculation level in the content
    const speculationLevel = detectSpeculationLevel(contentToAnalyze);

    // Search for evidence about claims in the content
    const searchResults = await searchForEvidence(contentToAnalyze);
    const searchContext = formatSearchResultsContext(searchResults);

    // For image-extracted text, emphasize real-time verification
    const sourceTypeNote = sourceType === 'image' ? `
NOTE: This content was extracted from an uploaded image using OCR technology. OCR extraction may contain minor text recognition errors. Therefore:
- HEAVILY rely on the search results below for verification
- If search results contradict or don't support the claims, be skeptical
- Reduce confidence if OCR text quality appears poor or claims seem unlikely
- Cross-reference with multiple search sources before confirming
    ` : '';

    // Enhanced analysis prompt with nuanced verdict categories
    const prompt = `You are a professional fact-checking expert specializing in nuanced assessment of news claims.

${sourceTypeNote}

CRITICAL INSTRUCTIONS:
- DO NOT classify articles as FABRICATED unless the MAJORITY of claims are provably false
- If claims are unverified or future-based, classify as SPECULATIVE, not FAKE
- If article contains mix of verified and unverified claims, classify as PARTIALLY_TRUE or MISLEADING
- High source credibility reduces likelihood of FABRICATED verdict
- Presence of speculation language should reduce overall confidence (cap at 75% max if speculation detected)
- Only allow >85% confidence when claims are verifiable, properly sourced, and contain no speculative language
${sourceType === 'image' ? `
- For OCR-extracted text: MUST verify against search results. If search results contradict claims, favor search results over OCR text
- If search results strongly support claims in the image, confidence can be higher (up to 90%)
- If search results are absent or weak, cap confidence at 65%
` : ''}

VERDICT CATEGORIES:
- VERIFIED: All major claims supported by credible sources with citations
- PARTIALLY_TRUE: Mix of verified claims and unverified/speculative claims
- SPECULATIVE: Article mainly contains predictions, leaks, future assumptions without current evidence
- MISLEADING: Uses real facts but draws unsupported conclusions or presents context deceptively
- FABRICATED: Majority of claims are provably false or completely invented

Article Content:
${contentToAnalyze}

SEARCH VERIFICATION RESULTS (Real-time sources):
${searchContext}

Analyze this article and provide structured output:

1. Identify 3-5 key factual claims
2. For each claim, determine: verified/unverified/speculative status using SEARCH RESULTS AS PRIMARY TRUTH
3. Cross-reference claims against the search results above
4. Assess source credibility (who wrote this, are they known to be reliable)
5. Rate the strength of available evidence from search results
6. Calculate speculation level (are there future predictions, rumors, unconfirmed reports?)
7. Determine appropriate verdict using the categories above
8. Calibrate confidence:
${sourceType === 'image' ? `   - If search results SUPPORT claims: 70-90% confidence
   - If search results CONTRADICT claims: 10-40% confidence (article is wrong)
   - If search results are ABSENT but claims seem plausible: 50-70% confidence
   - If search results are ABUNDANT and clear: up to 95% confidence` : `   - Reduce if mixed signals exist (cap at 60-75%)
   - Only >85% for clear verified claims`}

Provide response as JSON:
{
  "verdict": "VERIFIED|PARTIALLY_TRUE|SPECULATIVE|MISLEADING|FABRICATED",
  "confidence": <0-100, calibrated for uncertainty>,
  "scores": {
    "source_credibility": <0-100>,
    "claim_verifiability": <0-100 - what % of claims can be verified by search>,
    "evidence_strength": <0-100 - how strong is the search evidence>,
    "speculation_level": <0-100 - how much speculation/future assumptions>,
    "overall_trust_score": <0-100 - final trust assessment>
  },
  "explanation": "<detailed explanation of verdict with specific reasoning and reference to search results>",
  "claim_analysis": [
    {
      "claim": "<specific claim from article>",
      "status": "verified|unverified|speculative",
      "evidence": "<what search results say about this>",
      "confidence": <0-100>
    }
  ],
  "suspiciousSentences": [
    {
      "text": "<quoted sentence>",
      "reason": "<why suspicious, especially if contradicts search results>",
      "severity": "LOW|MEDIUM|HIGH"
    }
  ],
  "bias": "Left|Center-Left|Center|Center-Right|Right|Neutral",
  "sentiment": "Positive|Negative|Neutral",
  "key_claims": ["claim1", "claim2", "claim3"],
  "prediction": "<legacy: REAL|FAKE|PARTIAL>"
}

SCORING LOGIC:
- PRIMARY SOURCE: Search results (from Tavily real-time verification)
- If search results STRONGLY SUPPORT all claims: VERIFIED (85-95% confidence)
- If search results show SAME EVENTS/FACTS: VERIFIED to PARTIALLY_TRUE (70-85%)
- If search results CONTRADICT claims: FABRICATED or MISLEADING (15-45% confidence, article is WRONG)
- If search results show PARTIAL MATCH: PARTIALLY_TRUE (60-75%)
- If search results are INSUFFICIENT: SPECULATIVE (50-65% max)
- overall_trust_score = (claim_verifiability_from_search * 0.4) + (source_credibility * 0.3) + (evidence_strength * 0.3)
- Reduce confidence if speculation_level >30`;

    // Call Groq API with JSON mode (uses the API key manager for rotation)
    const groqClient = getGroqClient();
    const response = await groqClient.chat.completions.create({
      model: 'openai/gpt-oss-120b', // GPT OSS 120B model on Groq
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2, // Even lower for consistent, precise analysis
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    });

    // Record API usage for rate limiting and monitoring
    recordApiUsage('groq');

    // Extract and parse the response
    const analysisText = response.choices[0].message.content;
    if (!analysisText) {
      throw new Error('No response from Groq API');
    }

    // Parse JSON response
    let analysis;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Groq response:', analysisText);
      throw new Error('Failed to parse analysis response');
    }

    // Ensure verdict is one of the allowed categories
    const validVerdicts = ['VERIFIED', 'PARTIALLY_TRUE', 'SPECULATIVE', 'MISLEADING', 'FABRICATED'];
    if (!validVerdicts.includes(analysis.verdict)) {
      analysis.verdict = 'PARTIALLY_TRUE'; // Default to uncertain category
    }

    // For image sources, apply confidence penalty if no strong search evidence
    if (sourceType === 'image' && !searchResults || (searchResults && searchResults.length === 0)) {
      analysis.confidence = Math.min(analysis.confidence, 65); // Cap at 65% if no search results for image
    }

    // Format grounding sources from search results
    const groundingSources = searchResults.map((result: any) => ({
      title: result.title,
      uri: result.url || result.uri
    }));

    // Ensure backward compatibility: add legacy prediction field if missing
    if (!analysis.prediction) {
      if (analysis.verdict === 'VERIFIED') analysis.prediction = 'REAL';
      else if (analysis.verdict === 'FABRICATED') analysis.prediction = 'FAKE';
      else analysis.prediction = 'PARTIAL';
    }

    // Backward compatibility: map key_claims to keyClaims for frontend
    const keyClaims = analysis.key_claims || analysis.keyClaims || [];

    // Return enriched response with backward compatibility
    const result = {
      ...analysis,
      keyClaims, // Frontend expects camelCase
      groundingSources,
      timestamp: new Date().toISOString(),
      speculationDetectedInContent: speculationLevel > 30
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Analysis API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze content' },
      { status: 500 }
    );
  }
}
