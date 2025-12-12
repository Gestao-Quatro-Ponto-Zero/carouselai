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
import { generateCarouselContent, processDocument, TEXT_MODEL_PRO, TEXT_MODEL_FLASH, setApiKey, getApiKeyMasked, hasApiKey } from './services/geminiService';
import { setApifyApiKey, getApifyApiKeyMasked, hasApifyApiKey } from './services/instagramService';
import Workspace from './components/Workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Key, Sparkles, Wrench, Upload, X, Loader2, Rocket, Sun, Moon } from 'lucide-react';

type EditorTheme = 'light' | 'dark';

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

  // Apify API key (for Instagram scraping)
  const [apifyKeyInput, setApifyKeyInput] = useState('');
  const [apifyKeyConfigured, setApifyKeyConfigured] = useState(false);
  const [showApifyKeyInput, setShowApifyKeyInput] = useState(false);
  const [apifyKeyDisplay, setApifyKeyDisplay] = useState('');

  // ============================================================================
  // EDITOR THEME (light/dark mode for the editor UI)
  // ============================================================================
  const [editorTheme, setEditorTheme] = useState<EditorTheme>('light');

  // Apply theme class to document root
  useEffect(() => {
    if (editorTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [editorTheme]);

  const toggleEditorTheme = () => {
    setEditorTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Check if API keys are already configured on mount
  useEffect(() => {
    // Gemini API key
    const geminiConfigured = hasApiKey();
    setApiKeyConfigured(geminiConfigured);
    setApiKeyDisplay(getApiKeyMasked());

    // Apify API key
    const apifyConfigured = hasApifyApiKey();
    setApifyKeyConfigured(apifyConfigured);
    setApifyKeyDisplay(getApifyApiKeyMasked());
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

  const handleSaveApifyKey = () => {
    if (apifyKeyInput.trim()) {
      setApifyApiKey(apifyKeyInput.trim());
      setApifyKeyConfigured(true);
      setApifyKeyDisplay(getApifyApiKeyMasked());
      setApifyKeyInput('');
      setShowApifyKeyInput(false);
    }
  };

  // --- Step 1: Select Format ---
  const handleFormatSelect = (selectedStyle: CarouselStyle) => {
    if (selectedStyle === CarouselStyle.TWITTER || selectedStyle === CarouselStyle.STORYTELLER || selectedStyle === CarouselStyle.LESSON) {
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
        editorTheme={editorTheme}
        onEditorThemeToggle={toggleEditorTheme}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-xl w-full overflow-hidden">

        {/* Header */}
        <CardHeader className="bg-card border-b text-center relative">
            {/* Theme Toggle */}
            <Button
                variant="ghost"
                size="icon"
                onClick={toggleEditorTheme}
                className="absolute right-4 top-4"
                title={editorTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
                {editorTheme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
            <CardTitle className="text-2xl font-bold tracking-tight">CarouselAI</CardTitle>
            <CardDescription>Create viral Instagram posts in seconds</CardDescription>
        </CardHeader>

        <CardContent className="p-8">

            {/* 1. Format Selection */}
            {step === 'FORMAT_SELECT' && (
                <div className="space-y-6">
                    {/* API Key Configuration */}
                    <div className="bg-muted/50 border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Key className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">Gemini API Key</p>
                                    {apiKeyConfigured ? (
                                        <p className="text-xs text-green-600">Configured: {apiKeyDisplay}</p>
                                    ) : (
                                        <p className="text-xs text-amber-600">Required for AI features</p>
                                    )}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                            >
                                {showApiKeyInput ? 'Cancel' : (apiKeyConfigured ? 'Change' : 'Setup')}
                            </Button>
                        </div>

                        {showApiKeyInput && (
                            <div className="mt-3 pt-3 border-t border-border">
                                <div className="flex gap-2">
                                    <Input
                                        type="password"
                                        value={apiKeyInput}
                                        onChange={(e) => setApiKeyInput(e.target.value)}
                                        placeholder="Enter your Gemini API key"
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                                        className="flex-1"
                                    />
                                    <Button
                                        onClick={handleSaveApiKey}
                                        disabled={!apiKeyInput.trim()}
                                    >
                                        Save
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a>
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Apify API Key Configuration (for Instagram) */}
                    <div className="bg-muted/50 border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Key className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">Apify API Token <span className="text-muted-foreground font-normal">(Instagram)</span></p>
                                    {apifyKeyConfigured ? (
                                        <p className="text-xs text-green-600">Configured: {apifyKeyDisplay}</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Optional - for Instagram URL scraping</p>
                                    )}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowApifyKeyInput(!showApifyKeyInput)}
                            >
                                {showApifyKeyInput ? 'Cancel' : (apifyKeyConfigured ? 'Change' : 'Setup')}
                            </Button>
                        </div>

                        {showApifyKeyInput && (
                            <div className="mt-3 pt-3 border-t border-border">
                                <div className="flex gap-2">
                                    <Input
                                        type="password"
                                        value={apifyKeyInput}
                                        onChange={(e) => setApifyKeyInput(e.target.value)}
                                        placeholder="Enter your Apify API token"
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApifyKey()}
                                        className="flex-1"
                                    />
                                    <Button
                                        onClick={handleSaveApifyKey}
                                        disabled={!apifyKeyInput.trim()}
                                    >
                                        Save
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Get your API token from <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Apify Console</a>
                                </p>
                            </div>
                        )}
                    </div>

                    <h2 className="text-xl font-semibold text-center">Choose a Style</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={() => handleFormatSelect(CarouselStyle.TWITTER)}
                            className="p-6 border-2 border-primary/50 bg-primary/5 rounded-xl text-left hover:shadow-lg hover:border-primary transition-all group"
                        >
                            <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center mb-4 text-xl font-bold">𝕏</div>
                            <h3 className="font-bold group-hover:text-primary">Twitter Style</h3>
                            <p className="text-sm text-muted-foreground mt-1">Classic tweet screenshot aesthetic. Clean, text-focused, authoritative.</p>
                        </button>
                        <button
                            onClick={() => handleFormatSelect(CarouselStyle.STORYTELLER)}
                            className="p-6 border-2 border-muted bg-muted/30 rounded-xl text-left hover:shadow-lg hover:border-primary/50 transition-all group"
                        >
                            <div className="w-10 h-10 bg-muted text-foreground rounded-full flex items-center justify-center mb-4 text-xl font-bold">📷</div>
                            <h3 className="font-bold group-hover:text-primary">Storyteller</h3>
                            <p className="text-sm text-muted-foreground mt-1">Image-first, bold typography, cinematic overlays. High impact.</p>
                        </button>
                        <button
                            onClick={() => handleFormatSelect(CarouselStyle.LESSON)}
                            className="p-6 border-2 border-muted bg-muted/30 rounded-xl text-left hover:shadow-lg hover:border-primary/50 transition-all group"
                        >
                            <div className="w-10 h-10 bg-muted text-foreground rounded-full flex items-center justify-center mb-4 text-xl font-bold">📚</div>
                            <h3 className="font-bold group-hover:text-primary">Lesson</h3>
                            <p className="text-sm text-muted-foreground mt-1">Educational content with cover image, centered footer. Black or white slides.</p>
                        </button>
                    </div>
                </div>
            )}

            {/* 2. Aspect Ratio Selection */}
            {step === 'ASPECT_RATIO_SELECT' && (
                <div className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-semibold text-center">Select Aspect Ratio</h2>
                    <p className="text-center text-muted-foreground text-sm">Choose the best fit for your Instagram post.</p>

                    <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto">
                        <button
                            onClick={() => handleAspectRatioSelect('1/1')}
                            className="flex flex-col items-center p-4 border-2 border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all group"
                        >
                            <div className="w-16 h-16 bg-muted rounded mb-3 group-hover:bg-primary/20 transition-colors"></div>
                            <span className="font-bold">Square (1:1)</span>
                            <span className="text-xs text-muted-foreground">Standard Post</span>
                        </button>

                        <button
                            onClick={() => handleAspectRatioSelect('4/5')}
                            className="flex flex-col items-center p-4 border-2 border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all group"
                        >
                            <div className="w-16 h-20 bg-muted rounded mb-3 group-hover:bg-primary/20 transition-colors"></div>
                            <span className="font-bold">Portrait (4:5)</span>
                            <span className="text-xs text-muted-foreground">Best for Reach</span>
                        </button>
                    </div>
                    <Button variant="ghost" onClick={() => setStep('FORMAT_SELECT')} className="w-full">Back</Button>
                </div>
            )}

            {/* 3. Profile Setup */}
            {step === 'PROFILE_INPUT' && (
                <form onSubmit={handleProfileSubmit} className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-semibold text-center">Profile Setup</h2>

                    <div className="flex flex-col items-center space-y-4">
                        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <img src={profile.avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-4 border-border shadow-sm" />
                            <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
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
                            <Label htmlFor="name">Display Name</Label>
                            <Input
                                id="name"
                                required
                                type="text"
                                value={profile.name}
                                onChange={e => setProfile({...profile, name: e.target.value})}
                                placeholder="e.g. Frank Costa"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="handle">Handle</Label>
                            <div className="flex mt-1">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">@</span>
                                <Input
                                    id="handle"
                                    required
                                    type="text"
                                    value={profile.handle}
                                    onChange={e => setProfile({...profile, handle: e.target.value})}
                                    placeholder="frankcosta"
                                    className="rounded-l-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button type="button" variant="secondary" onClick={() => setStep('ASPECT_RATIO_SELECT')} className="flex-1">
                            Back
                        </Button>
                        <Button type="submit" className="flex-[2]">
                            Continue
                        </Button>
                    </div>
                </form>
            )}

            {/* 4. Method Selection */}
            {step === 'METHOD_SELECT' && (
                <div className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-semibold text-center">How do you want to start?</h2>

                    <div className="grid grid-cols-1 gap-4">
                        <button
                            onClick={() => setStep('AI_INPUT')}
                            className="relative overflow-hidden p-6 border-2 border-primary/30 bg-primary/5 rounded-xl text-left hover:shadow-md hover:border-primary/50 transition-all group"
                        >
                            <div className="absolute top-0 right-0 p-2">
                                <span className="bg-primary text-primary-foreground text-[10px] uppercase font-bold px-2 py-1 rounded-full">Gemini 3 Pro</span>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="h-5 w-5 text-primary" />
                                <h3 className="font-bold text-lg">Use AI Magic</h3>
                            </div>
                            <p className="text-sm text-muted-foreground">Give us a topic, URL, or upload a document (PDF, TXT, MD) and we'll create 5-10 slides automatically.</p>
                        </button>

                        <button
                            onClick={handleManualCreate}
                            className="p-6 border-2 border-border bg-card rounded-xl text-left hover:border-muted-foreground/30 transition-all"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <Wrench className="h-5 w-5 text-muted-foreground" />
                                <h3 className="font-bold text-lg">Manual Creation</h3>
                            </div>
                            <p className="text-sm text-muted-foreground">Start from scratch. Add slides, write text, and upload images yourself.</p>
                        </button>
                    </div>
                    <Button variant="ghost" onClick={() => setStep('PROFILE_INPUT')} className="w-full">Back</Button>
                </div>
            )}

            {/* 5. AI Input */}
            {step === 'AI_INPUT' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold">What's your post about?</h2>
                        <p className="text-sm text-muted-foreground mt-1">We'll use Gemini to create a viral structure.</p>
                    </div>

                    {/* Topic Input */}
                    <div>
                        <Textarea
                            value={aiTopic}
                            onChange={(e) => setAiTopic(e.target.value)}
                            className="h-28 resize-none"
                            placeholder="Enter a topic, paste a YouTube or Instagram URL, or describe what you want to create..."
                        />
                    </div>

                    {/* Document Upload Section */}
                    <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                        {uploadedDocument ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">
                                        {uploadedDocument.type === 'pdf' ? '📄' : '📃'}
                                    </span>
                                    <div className="text-left">
                                        <p className="text-sm font-medium truncate max-w-[200px]">
                                            {uploadedDocument.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {(uploadedDocument.size / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleRemoveDocument}
                                    className="text-muted-foreground hover:text-destructive"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : isProcessingDocument ? (
                            <div className="flex items-center justify-center gap-2 py-2">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                <span className="text-sm text-muted-foreground">Processing document...</span>
                            </div>
                        ) : (
                            <label className="cursor-pointer block py-2">
                                <input
                                    type="file"
                                    ref={documentInputRef}
                                    className="hidden"
                                    accept=".pdf,.txt,.md"
                                    onChange={handleDocumentUpload}
                                />
                                <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                                <span className="text-primary font-medium">Upload a document</span>
                                <span className="text-muted-foreground text-sm ml-1">(PDF, TXT, MD)</span>
                            </label>
                        )}
                    </div>

                    {documentError && (
                        <p className="text-destructive text-sm text-center">{documentError}</p>
                    )}

                    <p className="text-xs text-muted-foreground text-center">
                        {uploadedDocument
                            ? "Add a topic above to guide the carousel style, or generate directly from the document."
                            : "Or upload a document to automatically extract content for your carousel."}
                    </p>

                    {/* Controls Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs uppercase mb-2 block">Slide Count</Label>
                            <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-md border border-border">
                                <Slider
                                    value={[slideCount]}
                                    onValueChange={(value) => setSlideCount(value[0])}
                                    min={3}
                                    max={15}
                                    step={1}
                                    className="flex-1"
                                />
                                <span className="w-6 text-center font-bold text-sm">{slideCount}</span>
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs uppercase mb-2 block">AI Model</Label>
                            <Select value={selectedTextModel} onValueChange={setSelectedTextModel}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={TEXT_MODEL_PRO}>Gemini 3 Pro (Best)</SelectItem>
                                    <SelectItem value={TEXT_MODEL_FLASH}>Gemini 2.5 Flash (Fast)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Button
                        onClick={handleAiGenerate}
                        disabled={isGenerating || (!aiTopic.trim() && !uploadedDocument)}
                        className="w-full h-12"
                        size="lg"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                Generating Strategy...
                            </>
                        ) : (
                            <>
                                <Rocket className="h-5 w-5 mr-2" />
                                Generate Slides
                            </>
                        )}
                    </Button>

                    {!isGenerating && (
                        <Button variant="ghost" onClick={() => setStep('METHOD_SELECT')} className="w-full">Back</Button>
                    )}
                </div>
            )}

        </CardContent>
      </Card>
    </div>
  );
};

export default App;
