# TruthLens - AI Fake News Detection

TruthLens is a full-stack real-time system designed to verify the authenticity of news articles and text using advanced AI.

## Features

- **Dual Input**: Analyze raw text or news article URLs.
- **Smart Scraping**: Automatically extracts and cleans content from URLs.
- **AI Analysis**: Powered by Gemini 3 Flash for high-accuracy detection.
- **Explainability**: Highlights suspicious sentences with detailed reasoning tooltips.
- **Source Credibility**: Analyzes domain reputation and assigns trust scores.
- **Bias & Sentiment**: Detects political bias and overall emotional tone.
- **Modern UI**: Clean, responsive interface built with Tailwind CSS and Framer Motion.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4.
- **Backend**: Next.js API Routes (Node.js).
- **AI**: Google Gemini API (@google/genai).
- **Scraping**: Cheerio.
- **Animations**: Framer Motion.

## Getting Started Locally

### Prerequisites

- Node.js 20+ 
- npm or yarn
- A Google Gemini API Key

### Installation

1. Clone the repository (or download the source).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Create a `.env.local` file in the root directory and add:
   ```env
   NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## How it Works

1. **Input**: User provides text or a URL.
2. **Preprocessing**: If a URL is provided, the system scrapes the HTML, removes noise (ads, scripts), and extracts the main article body.
3. **AI Inference**: The content is sent to Gemini with a structured schema request.
4. **Analysis**: The model evaluates claims, checks for logical fallacies, and identifies suspicious patterns.
5. **Visualization**: Results are displayed with confidence scores, bias indicators, and interactive text highlighting.

---
*Disclaimer: TruthLens is an AI-assisted tool. Always cross-reference information with multiple reliable sources.*
