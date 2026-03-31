import { GoogleGenAI, Type } from "@google/genai";

// ⚠️ IMPORTANT: This file should ONLY be imported on the server side
// DO NOT use this in client components or browser code

// Get API key from backend environment (backend-only)
const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ GEMINI_API_KEY is not configured. Please set it in .env.local');
  throw new Error(
    "GEMINI_API_KEY is not defined. Set GEMINI_API_KEY in .env.local (NOT NEXT_PUBLIC_GEMINI_API_KEY)"
  );
}

// Warn if using the public key (security risk)
if (process.env.NEXT_PUBLIC_GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
  console.warn(
    '⚠️ SECURITY WARNING: NEXT_PUBLIC_GEMINI_API_KEY is exposed. Use GEMINI_API_KEY instead.'
  );
}

export const genAI = new GoogleGenAI({ apiKey });

export const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    prediction: {
      type: Type.STRING,
      description: "Either 'REAL' or 'FAKE'",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence score from 0 to 100",
    },
    explanation: {
      type: Type.STRING,
      description: "A detailed explanation of why the news is likely real or fake.",
    },
    suspiciousSentences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          reason: { type: Type.STRING },
          severity: { type: Type.STRING, description: "LOW, MEDIUM, HIGH" }
        },
        required: ["text", "reason", "severity"]
      }
    },
    bias: {
      type: Type.STRING,
      description: "Political bias: Left, Center-Left, Center, Center-Right, Right, or Neutral",
    },
    sentiment: {
      type: Type.STRING,
      description: "Overall sentiment: Positive, Negative, or Neutral",
    },
    keyClaims: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of main claims made in the text",
    }
  },
  required: ["prediction", "confidence", "explanation", "suspiciousSentences", "bias", "sentiment"]
};
