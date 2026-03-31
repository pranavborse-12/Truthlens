'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { 
  Link as LinkIcon, 
  FileText, 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  RefreshCw, 
  Globe,
  Fingerprint,
  Scale,
  Activity,
  ChevronRight,
  ExternalLink,
  History,
  ImageIcon,
  Plus,
  X
} from 'lucide-react';
import { HighlightedText } from '@/components/HighlightedText';
import { TruthLensBrand } from '@/components/Logo';
import { AnalysisSkeleton } from '@/components/Skeleton';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AnalysisResult {
  prediction: 'REAL' | 'FAKE';
  confidence: number;
  explanation: string;
  suspiciousSentences: {
    text: string;
    reason: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
  bias: string;
  sentiment: string;
  keyClaims: string[];
  sourceInfo?: {
    domain: string;
    score: number;
  };
  groundingSources?: {
    title: string;
    uri: string;
  }[];
  timestamp: string;
}

export default function TruthLens() {
  const [inputType, setInputType] = useState<'text' | 'url' | 'image'>('text');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzedText, setAnalyzedText] = useState('');
  const [preview, setPreview] = useState<{ content: string; source?: { domain: string; score: number } } | null>(null);
  const [isConfirmingContent, setIsConfirmingContent] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractedImageText, setExtractedImageText] = useState('');
  const [isOCRing, setIsOCRing] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Helper function to detect if input is a URL
  const isUrlInput = (input: string): boolean => {
    try {
      new URL(input);
      return true;
    } catch {
      return false;
    }
  };

  // Handler for image file selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG, WebP)');
      return;
    }

    setSelectedImage(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Process image with OCR
    await processImageOCR(file);
  };

  // Handle image OCR extraction
  const processImageOCR = async (file: File) => {
    setIsOCRing(true);
    try {
      // Dynamically import tesseract.js to avoid hydration issues
      const Tesseract = (await import('tesseract.js')).default;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageData = event.target?.result as string;
        
        const result = await Tesseract.recognize(imageData, 'eng');
        const extractedText = result.data.text;
        
        setExtractedImageText(extractedText);
        setInputValue(extractedText);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('OCR Error:', err);
      setError('Failed to extract text from image. Please try another image or paste the text manually.');
      setExtractedImageText('');
    } finally {
      setIsOCRing(false);
    }
  };

  // Clear input when switching tabs
  const handleTabSwitch = (type: 'text' | 'url' | 'image') => {
    setInputType(type);
    setInputValue('');
    setSelectedImage(null);
    setImagePreview(null);
    setExtractedImageText('');
    setError(null);
  };

  // Step 1: Prepare and preview content
  const handlePrepareContent = async () => {
    if (!inputValue.trim() && inputType !== 'image') return;
    if (inputType === 'image' && !selectedImage) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setPreview(null);
    setAnalyzedText('');

    try {
      // Validation: Check if URL was pasted in text mode
      if (inputType === 'text' && isUrlInput(inputValue.trim())) {
        throw new Error('❌ URL detected in Paste Text mode. Please switch to "Article URL" tab to analyze links.');
      }

      // Validation: Check if URL mode has valid URL
      if (inputType === 'url' && !isUrlInput(inputValue.trim())) {
        throw new Error('❌ Invalid URL format. Please enter a valid web address (e.g., https://example.com)');
      }

      const prepResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          inputType === 'url' ? { url: inputValue } : { text: inputValue }
        ),
      });

      if (!prepResponse.ok) {
        const data = await prepResponse.json();
        throw new Error(data.error || 'Failed to prepare content');
      }

      const { contentToAnalyze, sourceInfo } = await prepResponse.json();
      
      // Show preview for user confirmation
      setPreview({
        content: contentToAnalyze,
        source: sourceInfo
      });
      setIsConfirmingContent(true);
    } catch (err: any) {
      console.error('Prep Error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Analyze after content confirmation
  const handleConfirmAndAnalyze = async () => {
    if (!preview) return;

    setIsLoading(true);
    setError(null);

    try {
      const contentToAnalyze = preview.content;
      setAnalyzedText(contentToAnalyze);

      // Call the new Groq + Tavily analysis endpoint with source type
      const analysisResponse = await fetch('/api/analyze-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentToAnalyze,
          sourceType: inputType // Pass 'text', 'url', or 'image' to enable proper verification
        }),
      });

      if (!analysisResponse.ok) {
        const data = await analysisResponse.json();
        throw new Error(data.error || 'Failed to analyze content');
      }

      const analysis = await analysisResponse.json();

      setResult({
        ...analysis,
        sourceInfo: preview.source,
        timestamp: new Date().toISOString(),
      });
      setIsConfirmingContent(false);
      setPreview(null);
    } catch (err: any) {
      console.error('Analysis Error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen selection:bg-ink selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 md:h-20 border-b border-zinc-100 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between">
          <TruthLensBrand />
        </div>
      </nav>

      <main className="pt-24 md:pt-32 pb-16 md:pb-24 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12 md:mb-16 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-50 border border-zinc-100 text-[9px] md:text-[10px] font-bold tracking-widest text-muted uppercase"
            >
              <Activity className="w-3 h-3 text-emerald-500" />
              Real-time Verification Engine
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-3xl md:text-5xl lg:text-7xl font-bold tracking-tight text-ink max-w-4xl mx-auto leading-[1.1]"
            >
              Clarity in an era of <span className="text-muted italic font-medium">misinformation.</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-base md:text-lg lg:text-xl text-muted max-w-2xl mx-auto text-balance px-2"
            >
              TruthLens uses advanced neural analysis to dissect claims, identify bias, and verify sources with surgical precision.
            </motion.p>
          </div>

          {/* Input Interface */}
          <section className="max-w-4xl mx-auto mb-12 md:mb-20">
            <div className="bg-white rounded-[32px] premium-shadow border border-zinc-100 overflow-hidden">
              <div className="p-2 flex flex-col md:flex-row gap-2 md:gap-0 bg-zinc-50/50 border-b border-zinc-100">
                <button 
                  onClick={() => handleTabSwitch('text')}
                  className={cn(
                    "flex-1 py-2 md:py-3 text-xs font-bold tracking-wider uppercase rounded-2xl transition-all flex items-center justify-center gap-2",
                    inputType === 'text' ? "bg-white text-ink shadow-sm" : "text-muted hover:text-zinc-600"
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Paste Text</span>
                  <span className="sm:hidden">Text</span>
                </button>
                <button 
                  onClick={() => handleTabSwitch('url')}
                  className={cn(
                    "flex-1 py-2 md:py-3 text-xs font-bold tracking-wider uppercase rounded-2xl transition-all flex items-center justify-center gap-2",
                    inputType === 'url' ? "bg-white text-ink shadow-sm" : "text-muted hover:text-zinc-600"
                  )}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Article URL</span>
                  <span className="sm:hidden">URL</span>
                </button>
                <button 
                  onClick={() => handleTabSwitch('image')}
                  className={cn(
                    "flex-1 py-2 md:py-3 text-xs font-bold tracking-wider uppercase rounded-2xl transition-all flex items-center justify-center gap-2",
                    inputType === 'image' ? "bg-white text-ink shadow-sm" : "text-muted hover:text-zinc-600"
                  )}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Upload Image</span>
                  <span className="sm:hidden">Image</span>
                </button>
              </div>
              
              <div className="p-4 md:p-8 relative">
                {inputType === 'text' ? (
                  <textarea 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Paste your news text here"
                    className="w-full h-32 md:h-40 p-0 bg-transparent border-none focus:ring-0 outline-none text-base md:text-lg text-ink placeholder:text-zinc-300 resize-none font-serif"
                  />
                ) : inputType === 'url' ? (
                  <div className="relative py-4">
                    <input 
                      type="url"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="https://news-source.com/article-path"
                      className="w-full p-0 bg-transparent border-none focus:ring-0 outline-none text-xl text-ink placeholder:text-zinc-300 font-sans"
                    />
                  </div>
                ) : (
                  <div className="relative py-4 md:py-8">
                    <div className="flex flex-col items-center justify-center gap-4 py-8 md:py-12">
                      {imagePreview ? (
                        <div className="relative">
                          <img src={imagePreview} alt="preview" className="max-w-xs md:max-w-sm max-h-48 rounded-xl shadow-md" />
                          <button
                            onClick={() => {
                              setSelectedImage(null);
                              setImagePreview(null);
                              setExtractedImageText('');
                              setInputValue('');
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="absolute -top-2 -right-2 bg-white text-ink rounded-full p-1 shadow-lg hover:bg-zinc-100 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-center space-y-3">
                          <div className="w-12 md:w-16 h-12 md:h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto">
                            <ImageIcon className="w-6 md:w-8 h-6 md:h-8 text-zinc-300" />
                          </div>
                          <div>
                            <p className="text-xs md:text-sm font-semibold text-ink">Upload a news screenshot</p>
                            <p className="text-[10px] md:text-xs text-zinc-500">We'll extract text using AI recognition</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <input 
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </div>
                )}

                {inputType === 'image' && !imagePreview && (
                  <div className="absolute bottom-4 md:bottom-8 left-4 md:left-8">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isOCRing}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-ink text-white rounded-full hover:bg-zinc-800 transition-colors disabled:bg-zinc-300 text-xs font-bold"
                    >
                      {isOCRing ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Upload
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-zinc-50 flex items-center justify-end">
                  <button 
                    onClick={handlePrepareContent}
                    disabled={isLoading || !inputValue.trim()}
                    className="group px-6 md:px-8 py-3 md:py-4 bg-ink text-white rounded-2xl font-bold transition-all flex items-center gap-2 md:gap-3 hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 active:scale-95 shadow-xl shadow-ink/10 text-sm md:text-base"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 md:w-5 h-4 md:h-5 animate-spin" />
                    ) : (
                      <>
                        Analyze Insight
                        <ChevronRight className="w-3 md:w-4 h-3 md:h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Content Preview Section */}
          {isConfirmingContent && preview && (
            <motion.section 
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto mb-12 md:mb-20"
            >
              <div className="bg-white rounded-[32px] border border-blue-100/50 premium-shadow overflow-hidden">
                <div className="px-4 md:px-10 py-6 md:py-8 border-b border-blue-50 bg-blue-50/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-blue-900">Content Preview</h3>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                    <Fingerprint className="w-3 h-3" />
                    Verify before analyzing
                  </div>
                </div>
                
                <div className="p-4 md:p-10">
                  <p className="text-xs text-muted uppercase tracking-widest font-bold mb-4">This is the content we will analyze. Please verify it matches what you intended:</p>
                  
                  <div className="bg-zinc-50 rounded-2xl p-4 md:p-6 max-h-80 overflow-y-auto border border-zinc-100 mb-6">
                    <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap font-serif">
                      {preview.content}
                    </p>
                  </div>

                  {preview.source && (
                    <div className="pb-6 border-b border-zinc-100">
                      <p className="text-xs text-muted uppercase tracking-widest font-bold mb-3">Source Information</p>
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-100 gap-4">
                        <div>
                          <p className="font-bold text-ink">{preview.source.domain}</p>
                          <p className="text-[10px] text-muted uppercase tracking-widest">Credibility Score</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-ink">{preview.source.score}</p>
                          <p className="text-[10px] text-muted uppercase tracking-widest">/ 100</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {inputType === 'image' && (
                    <div className="pb-6 border-b border-zinc-100">
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex gap-3">
                        <Fingerprint className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-blue-900 mb-1">Real-time Verification Active</p>
                          <p className="text-xs text-blue-700 leading-relaxed">
                            This image text will be verified against current news sources and databases. Accuracy depends on search result availability for the claims in the image.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row gap-4 pt-6">
                    <button 
                      onClick={() => {
                        setIsConfirmingContent(false);
                        setPreview(null);
                      }}
                      className="flex-1 px-6 py-3 bg-zinc-100 text-ink rounded-2xl font-bold hover:bg-zinc-200 transition-colors text-sm md:text-base"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleConfirmAndAnalyze}
                      disabled={isLoading}
                      className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-colors disabled:bg-zinc-300 flex items-center justify-center gap-2 text-sm md:text-base"
                    >
                      {isLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Confirm & Analyze
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {/* Results Area */}
          <div className="relative min-h-[400px]">
            <AnimatePresence mode="wait">
              {isLoading && <AnalysisSkeleton key="loading" />}
              
              {error && (
                <motion.div 
                  key="error"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 md:p-12 rounded-[32px] md:rounded-[40px] bg-rose-50 border border-rose-100 text-center space-y-4"
                >
                  <div className="w-12 md:w-16 h-12 md:h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
                    <AlertTriangle className="w-6 md:w-8 h-6 md:h-8" />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-rose-900">Analysis Interrupted</h3>
                  <p className="text-xs md:text-base text-rose-700 max-w-md mx-auto">{error}</p>
                  <button 
                    onClick={() => setError(null)}
                    className="px-4 md:px-6 py-2 bg-rose-600 text-white rounded-full text-xs md:text-sm font-bold hover:bg-rose-700 transition-colors"
                  >
                    Try again
                  </button>
                </motion.div>
              )}

              {result && (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {/* Bento Grid Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
                    {/* Main Verdict */}
                    <div className={cn(
                      "md:col-span-8 p-6 md:p-10 rounded-[32px] md:rounded-[40px] border flex flex-col justify-between relative overflow-hidden",
                      result.prediction === 'REAL' ? "bg-emerald-50/30 border-emerald-100/50" : "bg-rose-50/30 border-rose-100/50"
                    )}>
                      <div className="relative z-10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 md:mb-10 gap-4">
                          <div className={cn(
                            "px-4 md:px-5 py-2 rounded-full text-xs font-black tracking-[0.2em] uppercase flex items-center gap-2.5 w-fit",
                            result.prediction === 'REAL' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                          )}>
                            {result.prediction === 'REAL' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                            Verdict: {result.prediction}
                          </div>
                          <div className="flex items-center gap-3 md:gap-4">
                            <div className="text-right">
                              <div className="text-3xl md:text-4xl font-display font-bold text-ink">{result.confidence}%</div>
                              <div className="text-[10px] font-bold text-muted uppercase tracking-widest">Confidence</div>
                            </div>
                            <div className="w-10 md:w-12 h-10 md:h-12 rounded-full border-4 border-zinc-100 relative flex items-center justify-center flex-shrink-0">
                              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                                <circle 
                                  cx="50" cy="50" r="42" 
                                  fill="transparent" 
                                  stroke="currentColor" 
                                  strokeWidth="8" 
                                  className={result.prediction === 'REAL' ? "text-emerald-500" : "text-rose-500"}
                                  strokeDasharray={`${result.confidence * 2.64} 264`}
                                />
                              </svg>
                            </div>
                          </div>
                        </div>
                        
                        <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-ink leading-tight">Analysis Insight</h2>
                        <p className="text-base md:text-xl text-zinc-600 leading-relaxed font-serif max-w-2xl italic">
                          &quot;{result.explanation}&quot;
                        </p>
                      </div>
                      
                      <div className="mt-8 md:mt-12 flex flex-wrap gap-3 md:gap-4 relative z-10">
                        <div className="px-3 md:px-4 py-2 rounded-xl bg-white/50 border border-zinc-100 flex items-center gap-2 md:gap-3">
                          <Scale className="w-4 h-4 text-muted" />
                          <span className="text-xs font-bold text-ink uppercase tracking-wider">{result.bias} Bias</span>
                        </div>
                        <div className="px-3 md:px-4 py-2 rounded-xl bg-white/50 border border-zinc-100 flex items-center gap-2 md:gap-3">
                          <Fingerprint className="w-4 h-4 text-muted" />
                          <span className="text-xs font-bold text-ink uppercase tracking-wider">{result.sentiment} Tone</span>
                        </div>
                      </div>

                      {/* Subtle background graphic */}
                      <div className="absolute -right-20 -bottom-20 opacity-[0.03] pointer-events-none">
                        <Shield className="w-80 h-80" />
                      </div>
                    </div>

                    {/* Source Credibility */}
                    <div className="md:col-span-4 bg-white p-6 md:p-10 rounded-[32px] md:rounded-[40px] border border-zinc-100 premium-shadow flex flex-col">
                      <div className="flex items-center justify-between mb-6 md:mb-8">
                        <h3 className="text-xs font-black uppercase tracking-widest text-muted">Source Integrity</h3>
                        <Globe className="w-5 h-5 text-zinc-300" />
                      </div>
                      
                      {result.sourceInfo ? (
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="space-y-2">
                            <div className="text-xl md:text-2xl font-bold text-ink truncate">{result.sourceInfo.domain}</div>
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-50 text-[10px] font-bold text-muted uppercase tracking-wider">
                              Verified Publisher
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <div className="flex items-end justify-between">
                              <div className="text-4xl md:text-5xl font-display font-bold text-ink">{result.sourceInfo.score}</div>
                              <div className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">Trust Index</div>
                            </div>
                            <div className="h-3 bg-zinc-50 rounded-full overflow-hidden p-0.5 border border-zinc-100">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${result.sourceInfo.score}%` }}
                                className={cn(
                                  "h-full rounded-full transition-all duration-1000",
                                  result.sourceInfo.score > 70 ? "bg-emerald-500" : result.sourceInfo.score > 40 ? "bg-amber-500" : "bg-rose-500"
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                          <div className="w-12 md:w-16 h-12 md:h-16 rounded-full bg-zinc-50 flex items-center justify-center">
                            <History className="w-6 md:w-8 h-6 md:h-8 text-zinc-200" />
                          </div>
                          <p className="text-xs md:text-sm text-muted font-medium">No source metadata available for raw text input.</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Grounding Sources */}
                  {result.groundingSources && result.groundingSources.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="bg-white rounded-[32px] md:rounded-[40px] border border-zinc-100 premium-shadow p-6 md:p-10"
                    >
                      <div className="flex items-center justify-between mb-6 md:mb-8">
                        <h3 className="text-xs font-black uppercase tracking-widest text-muted">Verification Sources</h3>
                        <Globe className="w-5 h-5 text-zinc-300" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                        {result.groundingSources.map((source, idx) => (
                          <a 
                            key={idx}
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-4 md:p-5 rounded-2xl md:rounded-3xl border border-zinc-100 hover:border-ink/20 hover:bg-zinc-50 transition-all group"
                          >
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="text-xs md:text-sm font-bold text-ink truncate">{source.title}</span>
                              <span className="text-[10px] font-bold text-muted uppercase tracking-widest truncate">{new URL(source.uri).hostname}</span>
                            </div>
                            <ExternalLink className="w-4 h-4 text-zinc-300 group-hover:text-ink transition-colors shrink-0" />
                          </a>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Editorial Content Analysis */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
                    <div className="md:col-span-8 bg-white rounded-[32px] md:rounded-[40px] border border-zinc-100 premium-shadow overflow-hidden">
                      <div className="px-6 md:px-10 py-6 md:py-8 border-b border-zinc-50 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-zinc-50/30">
                        <h3 className="text-xs font-black uppercase tracking-widest text-muted">Editorial Breakdown</h3>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted uppercase tracking-widest">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          Live Analysis
                        </div>
                      </div>
                      <div className="p-6 md:p-10 lg:p-16 space-y-6 md:space-y-10">
                        <div className="prose prose-zinc max-w-none">
                          <p className="text-base md:text-lg text-ink font-medium leading-relaxed italic opacity-80 border-l-4 border-zinc-100 pl-4 md:pl-6">
                            &quot;{result.explanation}&quot;
                          </p>
                        </div>
                        
                        <div className="h-px bg-zinc-50" />

                        <HighlightedText 
                          text={analyzedText} 
                          suspiciousSentences={result.suspiciousSentences} 
                        />
                      </div>
                    </div>

                    {/* Sidebar Metrics */}
                    <div className="md:col-span-4 space-y-4 md:space-y-6">
                      {/* Key Claims */}
                      <div className="bg-white p-6 md:p-8 rounded-[32px] border border-zinc-100 premium-shadow">
                        <h3 className="text-xs font-black uppercase tracking-widest text-muted mb-4 md:mb-6">Key Claims</h3>
                        <div className="space-y-3 md:space-y-4">
                          {result.keyClaims.map((claim, i) => (
                            <div key={i} className="flex gap-3 md:gap-4 group">
                              <span className="text-xs font-bold text-zinc-300 group-hover:text-ink transition-colors shrink-0">0{i+1}</span>
                              <p className="text-xs md:text-sm text-zinc-600 leading-relaxed font-medium">{claim}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bias & Sentiment */}
                      <div className="bg-white p-6 md:p-8 rounded-[32px] border border-zinc-100 premium-shadow">
                        <h3 className="text-xs font-black uppercase tracking-widest text-muted mb-4 md:mb-6">Bias & Sentiment</h3>
                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-muted uppercase tracking-widest">Political Bias</div>
                            <div className="text-xs md:text-sm font-bold text-ink">{result.bias}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-muted uppercase tracking-widest">Sentiment</div>
                            <div className="text-xs md:text-sm font-bold text-ink">{result.sentiment}</div>
                          </div>
                        </div>
                        <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-zinc-50">
                          <div className="flex items-center gap-2 text-xs text-muted">
                            <Scale className="w-3.5 h-3.5" />
                            <span>Neutrality Score: 84%</span>
                          </div>
                        </div>
                      </div>

                      {/* Suspicious Indicators */}
                      <div className="bg-ink p-6 md:p-8 rounded-[32px] text-white shadow-2xl">
                        <h3 className="text-xs font-black uppercase tracking-widest opacity-40 mb-4 md:mb-6">Risk Indicators</h3>
                        <div className="space-y-4 md:space-y-6">
                          {result.suspiciousSentences.slice(0, 3).map((sus, i) => (
                            <div key={i} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className={cn(
                                  "text-[8px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded",
                                  sus.severity === 'HIGH' ? "bg-rose-500/20 text-rose-400" : "bg-white/10 text-zinc-400"
                                )}>
                                  {sus.severity}
                                </span>
                              </div>
                              <p className="text-xs font-medium leading-relaxed opacity-80">{sus.reason}</p>
                            </div>
                          ))}
                          {result.suspiciousSentences.length === 0 && (
                            <p className="text-xs opacity-40 italic">No significant risks detected.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-100 py-12 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          <div className="col-span-1 md:col-span-2 space-y-6">
            <TruthLensBrand />
            <p className="text-muted text-xs md:text-sm max-w-xs leading-relaxed">
              TruthLens is a research-grade verification engine dedicated to restoring digital trust through neural analysis and source transparency.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-ink">Product</h4>
            <ul className="space-y-2 text-xs md:text-sm text-muted">
              <li><a href="#" className="hover:text-ink transition-colors">Verification API</a></li>
              <li><a href="#" className="hover:text-ink transition-colors">Browser Extension</a></li>
              <li><a href="#" className="hover:text-ink transition-colors">Enterprise</a></li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-ink">Company</h4>
            <ul className="space-y-2 text-xs md:text-sm text-muted">
              <li><a href="#" className="hover:text-ink transition-colors">About</a></li>
              <li><a href="#" className="hover:text-ink transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-ink transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 md:px-6 mt-12 md:mt-20 pt-6 md:pt-8 border-t border-zinc-50 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-[10px] font-bold text-muted uppercase tracking-widest">
          <span>© 2026 TruthLens Labs</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-ink">Twitter</a>
            <a href="#" className="hover:text-ink">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
