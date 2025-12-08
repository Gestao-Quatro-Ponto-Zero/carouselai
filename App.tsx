/**
 * App Component - Main Application & Onboarding Flow
 *
 * This is the root component that manages the onboarding wizard and routes to the Workspace.
 *
 * ONBOARDING FLOW (6 steps):
 * 1. FORMAT_SELECT    → Choose carousel style (Twitter or Storyteller)
 * 2. ASPECT_RATIO_SELECT → Choose post dimensions (1:1, 4:5)
 * 3. PROFILE_INPUT    → Enter name, handle, upload avatar
 * 4. METHOD_SELECT    → Choose "AI Magic" or "Manual Creation"
 * 5. AI_TOPIC_INPUT   → (AI only) Enter topic, slide count, model
 * 6. WORKSPACE        → Main editor with slides
 *
 * The step state machine controls which screen is displayed.
 * API key can be configured at multiple points in the flow.
 */

import React, { useState, useEffect } from 'react';
import { AppStep, CarouselStyle, Profile, Slide, SlideType, AspectRatio, UploadedDocument } from './types';
import { MOCK_SLIDES, DEFAULT_AVATAR } from './constants';
import { generateCarouselContent, processDocument, TEXT_MODEL_PRO, TEXT_MODEL_PRO_2_5, TEXT_MODEL_FLASH, setApiKey, getApiKeyMasked, hasApiKey } from './services/geminiService';
import Workspace from './components/Workspace';

const App: React.FC = () => {
  // ============================================================================
  // STATE MACHINE: Controls which onboarding step is displayed
  // ============================================================================
  const [step, setStep] = useState<AppStep>('FORMAT_SELECT');

  // ============================================================================
  // CAROUSEL SETTINGS (collected during onboarding)
  // ============================================================================
  const [style, setStyle] = useState<CarouselStyle>(CarouselStyle.TWITTER);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1/1');
  const [profile, setProfile] = useState<Profile>({
    name: 'Joao Vitor',
    handle: 'joaovitor',
    avatarUrl: 'https://picsum.photos/id/64/200/200'
  });
  const [slides, setSlides] = useState<Slide[]>(MOCK_SLIDES);

  // ============================================================================
  // AI GENERATION SETTINGS
  // ============================================================================
  const [aiTopic, setAiTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [slideCount, setSlideCount] = useState(7);
  const [selectedTextModel, setSelectedTextModel] = useState<string>(TEXT_MODEL_PRO);

  // ============================================================================
  // DOCUMENT UPLOAD STATE
  // ============================================================================
  const [uploadedDocument, setUploadedDocument] = useState<UploadedDocument | null>(null);
  const [isProcessingDocument, setIsProcessingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const documentInputRef = React.useRef<HTMLInputElement>(null);

  // ============================================================================
  // API KEY MANAGEMENT
  // Key can be configured via UI; persists to localStorage
  // ============================================================================
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyDisplay, setApiKeyDisplay] = useState('');

  // Check if API key is already configured on mount
  useEffect(() => {
    const configured = hasApiKey();
    setApiKeyConfigured(configured);
    setApiKeyDisplay(getApiKeyMasked());
  }, []);

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setApiKeyConfigured(true);
      setApiKeyDisplay(getApiKeyMasked());
      setApiKeyInput('');
      setShowApiKeyInput(false);
    }
  };

  // --- Step 1: Select Format ---
  const handleFormatSelect = (selectedStyle: CarouselStyle) => {
    if (selectedStyle === CarouselStyle.TWITTER || selectedStyle === CarouselStyle.STORYTELLER) {
      setStyle(selectedStyle);
      setStep('ASPECT_RATIO_SELECT');
    } else {
      alert("Coming soon!");
    }
  };

  // --- Step 2: Aspect Ratio ---
  const handleAspectRatioSelect = (ratio: AspectRatio) => {
    setAspectRatio(ratio);
    setStep('PROFILE_INPUT');
  };

  // --- Step 3: Profile Input ---
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('METHOD_SELECT');
  };

  /**
   * Converts uploaded avatar image to base64 data URI.
   *
   * WHY DATA URI:
   * - Works offline (no external URL dependency)
   * - Compatible with html-to-image export
   * - Persists with the profile state
   *
   * The FileReader.readAsDataURL() creates a string like:
   * "data:image/png;base64,iVBORw0KGgo..."
   */
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setProfile(prev => ({ ...prev, avatarUrl: event.target?.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Document Upload Handlers ---
  /**
   * Handles document upload for AI carousel generation.
   * Validates file type and size, then extracts content.
   */
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['pdf', 'txt', 'md'];
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !validTypes.includes(extension)) {
      setDocumentError('Unsupported file type. Use PDF, TXT, or MD.');
      return;
    }

    // Validate file size (20MB limit for inline base64)
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_SIZE) {
      setDocumentError('File too large. Maximum size is 20MB.');
      return;
    }

    setIsProcessingDocument(true);
    setDocumentError(null);

    try {
      const doc = await processDocument(file);
      setUploadedDocument(doc);
    } catch (error) {
      console.error('Document processing failed:', error);
      setDocumentError('Failed to process document. Please try again.');
    } finally {
      setIsProcessingDocument(false);
    }
  };

  /**
   * Removes the uploaded document.
   */
  const handleRemoveDocument = () => {
    setUploadedDocument(null);
    setDocumentError(null);
    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }
  };

  // --- Step 4: Method Selection ---
  const handleManualCreate = () => {
    setSlides([
        { id: '1', type: SlideType.COVER, content: 'Your Hook Here', showImage: false },
        { id: '2', type: SlideType.CONTENT, content: 'Your content goes here.', showImage: true },
        { id: '3', type: SlideType.CTA, content: 'Link in bio.', showImage: false },
    ]);
    setStep('WORKSPACE');
  };

  /**
   * Generates carousel content using Gemini AI.
   *
   * The user selects a model (Pro, 2.5 Pro, or Flash) in the UI.
   * The geminiService handles automatic fallback if the selected model fails.
   * Can use either a topic, an uploaded document, or both.
   *
   * On success: Navigate to Workspace with generated slides
   * On failure: Show alert (user should check API key)
   */
  const handleAiGenerate = async () => {
    // Require either topic OR document
    if (!aiTopic.trim() && !uploadedDocument) return;
    setIsGenerating(true);
    try {
      // Model fallback is handled internally by generateCarouselContent
      const generatedSlides = await generateCarouselContent(
        aiTopic,
        slideCount,
        selectedTextModel,
        uploadedDocument || undefined
      );
      setSlides(generatedSlides);
      setUploadedDocument(null); // Clear after successful generation
      setStep('WORKSPACE');
    } catch (error) {
      console.error(error);
      alert("AI Generation failed. Please check your API Key and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Render Steps ---

  if (step === 'WORKSPACE') {
    return (
      <Workspace
        slides={slides}
        profile={profile}
        style={style}
        aspectRatio={aspectRatio}
        onUpdateSlides={setSlides}
        onStyleChange={setStyle}
        onBack={() => setStep('METHOD_SELECT')}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header Progress */}
        <div className="bg-gray-900 p-6 text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">CarouselAI</h1>
            <p className="text-gray-400 text-sm mt-1">Create viral Instagram posts in seconds</p>
        </div>

        <div className="p-8">
            
            {/* 1. Format Selection */}
            {step === 'FORMAT_SELECT' && (
                <div className="space-y-6">
                    {/* API Key Configuration */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">🔑</span>
                                <div>
                                    <p className="text-sm font-medium text-gray-700">Gemini API Key</p>
                                    {apiKeyConfigured ? (
                                        <p className="text-xs text-green-600">Configured: {apiKeyDisplay}</p>
                                    ) : (
                                        <p className="text-xs text-amber-600">Required for AI features</p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                {showApiKeyInput ? 'Cancel' : (apiKeyConfigured ? 'Change' : 'Setup')}
                            </button>
                        </div>

                        {showApiKeyInput && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        value={apiKeyInput}
                                        onChange={(e) => setApiKeyInput(e.target.value)}
                                        placeholder="Enter your Gemini API key"
                                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                                    />
                                    <button
                                        onClick={handleSaveApiKey}
                                        disabled={!apiKeyInput.trim()}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium ${
                                            apiKeyInput.trim()
                                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        }`}
                                    >
                                        Save
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a>
                                </p>
                            </div>
                        )}
                    </div>

                    <h2 className="text-xl font-semibold text-gray-800 text-center">Choose a Style</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => handleFormatSelect(CarouselStyle.TWITTER)}
                            className="p-6 border-2 border-blue-500 bg-blue-50 rounded-xl text-left hover:shadow-lg transition-all group"
                        >
                            <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center mb-4 text-xl font-bold">𝕏</div>
                            <h3 className="font-bold text-gray-900 group-hover:text-blue-700">Twitter Style</h3>
                            <p className="text-sm text-gray-500 mt-1">Classic tweet screenshot aesthetic. Clean, text-focused, authoritative.</p>
                        </button>
                        <button
                            onClick={() => handleFormatSelect(CarouselStyle.STORYTELLER)}
                            className="p-6 border-2 border-purple-500 bg-purple-50 rounded-xl text-left hover:shadow-lg transition-all group"
                        >
                            <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center mb-4 text-xl font-bold">📷</div>
                            <h3 className="font-bold text-gray-900 group-hover:text-purple-700">Storyteller</h3>
                            <p className="text-sm text-gray-500 mt-1">Image-first, bold typography, cinematic overlays. High impact.</p>
                        </button>
                    </div>
                </div>
            )}

            {/* 2. Aspect Ratio Selection */}
            {step === 'ASPECT_RATIO_SELECT' && (
                <div className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-semibold text-gray-800 text-center">Select Aspect Ratio</h2>
                    <p className="text-center text-gray-500 text-sm">Choose the best fit for your Instagram post.</p>
                    
                    <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto">
                        <button
                            onClick={() => handleAspectRatioSelect('1/1')}
                            className="flex flex-col items-center p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
                        >
                            <div className="w-16 h-16 bg-gray-300 rounded mb-3 group-hover:bg-blue-200 transition-colors"></div>
                            <span className="font-bold text-gray-700">Square (1:1)</span>
                            <span className="text-xs text-gray-400">Standard Post</span>
                        </button>

                        <button
                            onClick={() => handleAspectRatioSelect('4/5')}
                            className="flex flex-col items-center p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
                        >
                            <div className="w-16 h-20 bg-gray-300 rounded mb-3 group-hover:bg-blue-200 transition-colors"></div>
                            <span className="font-bold text-gray-700">Portrait (4:5)</span>
                            <span className="text-xs text-gray-400">Best for Reach</span>
                        </button>
                    </div>
                     <button onClick={() => setStep('FORMAT_SELECT')} className="w-full text-center text-gray-400 text-sm hover:text-gray-600 mt-4">Back</button>
                </div>
            )}

            {/* 3. Profile Setup */}
            {step === 'PROFILE_INPUT' && (
                <form onSubmit={handleProfileSubmit} className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-semibold text-gray-800 text-center">Profile Setup</h2>
                    
                    <div className="flex flex-col items-center space-y-4">
                        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <img src={profile.avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-4 border-gray-100 shadow-sm" />
                            <div className="absolute inset-0 bg-black bg-opacity-30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                                Upload
                            </div>
                        </div>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*"
                            onChange={handleAvatarUpload}
                        />
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                            <input 
                                required
                                type="text" 
                                value={profile.name}
                                onChange={e => setProfile({...profile, name: e.target.value})}
                                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="e.g. Frank Costa"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Handle</label>
                            <div className="flex">
                                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">@</span>
                                <input 
                                    required
                                    type="text" 
                                    value={profile.handle}
                                    onChange={e => setProfile({...profile, handle: e.target.value})}
                                    className="w-full border border-gray-300 rounded-r-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="frankcosta"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex space-x-3">
                         <button type="button" onClick={() => setStep('ASPECT_RATIO_SELECT')} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                            Back
                        </button>
                        <button type="submit" className="flex-[2] bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors">
                            Continue
                        </button>
                    </div>
                </form>
            )}

            {/* 4. Method Selection */}
            {step === 'METHOD_SELECT' && (
                <div className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-semibold text-gray-800 text-center">How do you want to start?</h2>
                    
                    <div className="grid grid-cols-1 gap-4">
                         <button 
                            onClick={() => setStep('AI_INPUT')}
                            className="relative overflow-hidden p-6 border-2 border-purple-100 bg-purple-50 rounded-xl text-left hover:shadow-md transition-all group"
                        >
                            <div className="absolute top-0 right-0 p-2">
                                <span className="bg-purple-600 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-full">Gemini 3 Pro</span>
                            </div>
                            <h3 className="font-bold text-gray-900 text-lg">✨ Use AI Magic</h3>
                            <p className="text-sm text-gray-600 mt-1">Give us a topic, URL, or upload a document (PDF, TXT, MD) and we'll create 5-10 slides automatically.</p>
                        </button>

                        <button 
                            onClick={handleManualCreate}
                            className="p-6 border-2 border-gray-100 bg-white rounded-xl text-left hover:border-gray-300 transition-all"
                        >
                            <h3 className="font-bold text-gray-900 text-lg">🛠️ Manual Creation</h3>
                            <p className="text-sm text-gray-600 mt-1">Start from scratch. Add slides, write text, and upload images yourself.</p>
                        </button>
                    </div>
                     <button onClick={() => setStep('PROFILE_INPUT')} className="w-full text-center text-gray-400 text-sm hover:text-gray-600">Back</button>
                </div>
            )}

            {/* 5. AI Input */}
            {step === 'AI_INPUT' && (
                 <div className="space-y-6 animate-fade-in">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-gray-800">What's your post about?</h2>
                        <p className="text-sm text-gray-500 mt-1">We'll use Gemini to create a viral structure.</p>
                    </div>
                    
                    {/* Topic Input */}
                    <div>
                        <textarea
                            value={aiTopic}
                            onChange={(e) => setAiTopic(e.target.value)}
                            className="w-full h-28 border border-gray-300 rounded-lg p-4 focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                            placeholder="Enter a topic, paste a URL, or describe what you want to create..."
                        />
                    </div>

                    {/* Document Upload Section */}
                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-purple-400 transition-colors">
                        {uploadedDocument ? (
                            // Show uploaded file
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">
                                        {uploadedDocument.type === 'pdf' ? '📄' : '📃'}
                                    </span>
                                    <div className="text-left">
                                        <p className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
                                            {uploadedDocument.name}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {(uploadedDocument.size / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleRemoveDocument}
                                    className="text-gray-400 hover:text-red-500 p-1"
                                    type="button"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ) : isProcessingDocument ? (
                            // Loading state
                            <div className="flex items-center justify-center gap-2 py-2">
                                <svg className="animate-spin h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span className="text-sm text-gray-500">Processing document...</span>
                            </div>
                        ) : (
                            // Upload prompt
                            <label className="cursor-pointer block py-2">
                                <input
                                    type="file"
                                    ref={documentInputRef}
                                    className="hidden"
                                    accept=".pdf,.txt,.md"
                                    onChange={handleDocumentUpload}
                                />
                                <span className="text-purple-600 font-medium">Upload a document</span>
                                <span className="text-gray-400 text-sm ml-1">(PDF, TXT, MD)</span>
                            </label>
                        )}
                    </div>

                    {/* Error message */}
                    {documentError && (
                        <p className="text-red-500 text-sm text-center">{documentError}</p>
                    )}

                    {/* Helpful hint */}
                    <p className="text-xs text-gray-400 text-center">
                        {uploadedDocument
                            ? "Add a topic above to guide the carousel style, or generate directly from the document."
                            : "Or upload a document to automatically extract content for your carousel."}
                    </p>

                    {/* Controls Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className="text-xs text-gray-500 font-bold uppercase mb-1 block">Slide Count</label>
                             <div className="flex items-center space-x-2 bg-gray-50 p-2 rounded border border-gray-200">
                                 <input 
                                    type="range" 
                                    min="3" 
                                    max="15" 
                                    value={slideCount}
                                    onChange={(e) => setSlideCount(parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                 />
                                 <span className="w-6 text-center font-bold text-gray-800 text-sm">{slideCount}</span>
                             </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-bold uppercase mb-1 block">AI Model</label>
                            <div className="relative">
                                <select 
                                    value={selectedTextModel}
                                    onChange={(e) => setSelectedTextModel(e.target.value)}
                                    className="w-full appearance-none bg-white border border-gray-200 text-gray-800 text-sm rounded-lg p-3 pr-10 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none shadow-sm transition-all font-medium cursor-pointer"
                                >
                                    <option value={TEXT_MODEL_PRO}>Gemini 3 Pro (Best)</option>
                                    <option value={TEXT_MODEL_PRO_2_5}>Gemini 2.5 Pro (Balanced)</option>
                                    <option value={TEXT_MODEL_FLASH}>Gemini 2.5 Flash (Fast)</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleAiGenerate}
                        disabled={isGenerating || (!aiTopic.trim() && !uploadedDocument)}
                        className={`w-full py-4 rounded-lg font-bold text-white transition-all flex items-center justify-center space-x-2 ${
                            isGenerating || (!aiTopic.trim() && !uploadedDocument) ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-lg'
                        }`}
                    >
                        {isGenerating ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Generating Strategy...</span>
                            </>
                        ) : (
                            <span>🚀 Generate Slides</span>
                        )}
                    </button>
                    
                    {!isGenerating && (
                        <button onClick={() => setStep('METHOD_SELECT')} className="w-full text-center text-gray-400 text-sm hover:text-gray-600">Back</button>
                    )}
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default App;
