/**
 * Workspace Component
 *
 * The main editor interface for CarouselAI. This is the largest component in the app,
 * handling all slide editing, image generation, and export functionality.
 *
 * LAYOUT: Three-panel design
 * - Left sidebar: Slide list with thumbnails, batch mode controls
 * - Center canvas: Live slide preview with zoom controls
 * - Right sidebar: Slide properties, image settings, global options
 *
 * KEY FEATURES:
 * - Individual and batch image generation
 * - Image upload with AI stylization
 * - PNG export (single slide or ZIP of all)
 * - Markdown text editing with toolbar
 * - Theme, color, and layout customization
 */

import React, { useState, useRef, useEffect } from 'react';
import { Slide, Profile, CarouselStyle, CarouselProject, SlideType, AspectRatio, Theme, FontStyle, ContentLayout } from '../types';
import TwitterSlide from './TwitterSlide';
import StorytellerSlide from './StorytellerSlide';
import { generateSlideImage, stylizeImage, editImage, refineCarouselContent, getApiAspectRatio, IMAGE_MODEL_PRO, IMAGE_MODEL_FLASH, DEFAULT_IMAGE_STYLE, setApiKey, getApiKeyMasked, hasApiKey } from '../services/geminiService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Plus, Trash2, Download, ArrowLeft, Zap, Upload, X, Loader2,
  ChevronDown, ChevronUp, Settings, Image, Type, Palette,
  CheckSquare, Square, RefreshCw, Sparkles, Pencil, Sun, Moon,
  FileDown, FolderDown, Save, FolderOpen
} from 'lucide-react';

type EditorTheme = 'light' | 'dark';

interface WorkspaceProps {
  slides: Slide[];
  profile: Profile;
  style: CarouselStyle;
  aspectRatio: AspectRatio;
  onUpdateSlides: (slides: Slide[]) => void;
  onStyleChange?: (style: CarouselStyle) => void;  // For style conversion
  onBack: () => void;
  editorTheme?: EditorTheme;
  onEditorThemeToggle?: () => void;
}

// External libraries loaded via CDN in index.html
declare global {
  interface Window {
    htmlToImage: any;  // PNG export library
    JSZip: any;        // ZIP creation for batch export
    saveAs: any;       // File download helper
  }
}

const Workspace: React.FC<WorkspaceProps> = ({ slides, profile, style, aspectRatio, onUpdateSlides, onStyleChange, onBack, editorTheme = 'light', onEditorThemeToggle }) => {
  // ============================================================================
  // CORE STATE
  // ============================================================================
  const [activeSlideId, setActiveSlideId] = useState<string>(slides[0].id);
  const [generatingSlideIds, setGeneratingSlideIds] = useState<Set<string>>(new Set()); // Per-slide loading state
  const [isDownloading, setIsDownloading] = useState(false);

  // PATTERN: Stale Closure Workaround
  // Problem: Async handlers (image generation, stylization) capture `slides` at call time.
  // If user edits other slides while waiting, those changes would be lost when we update.
  // Solution: Keep a ref that always points to the CURRENT slides array.
  // Usage: In async handlers, use slidesRef.current instead of slides from closure.
  const slidesRef = useRef(slides);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  
  // ============================================================================
  // GLOBAL SETTINGS (apply to all slides)
  // ============================================================================
  const [showSlideNumbers, setShowSlideNumbers] = useState(true);
  const [showVerifiedBadge, setShowVerifiedBadge] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(0.4);           // Canvas preview scale (0.2 - 1.0)
  const [headerScale, setHeaderScale] = useState(1.0);       // Profile header size multiplier (0.5 - 2.0)
  const [accentColor, setAccentColor] = useState('#EAB308'); // Highlight color for markdown
  const [showAccent, setShowAccent] = useState(true);

  // ============================================================================
  // FONT SETTINGS (global, can be overridden per-slide)
  // ============================================================================
  const [fontStyle, setFontStyle] = useState<FontStyle>('MODERN');
  const [fontScale, setFontScale] = useState(1.0); // 0.5 - 1.5

  // ============================================================================
  // GLOBAL IMAGE STYLE
  // ============================================================================
  const [globalImageStyle, setGlobalImageStyle] = useState<string>(DEFAULT_IMAGE_STYLE);

  // ============================================================================
  // IMAGE GENERATION SETTINGS
  // ============================================================================
  const [selectedImageModel, setSelectedImageModel] = useState<string>(IMAGE_MODEL_PRO);
  const [imageAspectRatio, setImageAspectRatio] = useState<AspectRatio>('16/9');

  // Default theme: Storyteller uses dark (cinematic), Twitter uses light (clean)
  const [theme, setTheme] = useState<Theme>(
    style === CarouselStyle.STORYTELLER ? 'DARK' : 'LIGHT'
  );

  // ============================================================================
  // IMAGE UPLOAD & STYLIZATION STATE
  // ============================================================================
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingUploadImage, setPendingUploadImage] = useState<{
    base64: string;       // Full data URI for preview
    rawBase64: string;    // Raw base64 without prefix (for API)
    mimeType: string;     // e.g., "image/png", "image/jpeg"
    width: number;
    height: number;
    detectedRatio: string;  // Closest API-supported ratio (preserves original proportions)
  } | null>(null);
  const [stylizePrompt, setStylizePrompt] = useState('');
  const [isStylizing, setIsStylizing] = useState(false);

  // ============================================================================
  // AI IMAGE EDITING STATE
  // ============================================================================
  const [showEditImageModal, setShowEditImageModal] = useState(false);
  const [editImagePrompt, setEditImagePrompt] = useState('');

  // ============================================================================
  // BACKGROUND IMAGE GENERATION STATE
  // ============================================================================
  const [generatingBackgroundIds, setGeneratingBackgroundIds] = useState<Set<string>>(new Set()); // Per-slide background generation
  const [backgroundPrompt, setBackgroundPrompt] = useState(''); // User-provided prompt for background generation
  const [isEditingImage, setIsEditingImage] = useState(false);

  // ============================================================================
  // AI CONTENT REFINEMENT STATE
  // ============================================================================
  const [globalFeedback, setGlobalFeedback] = useState('');
  const [slideFeedback, setSlideFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  /**
   * Finds the closest API-supported aspect ratio for an uploaded image.
   * Used to preserve the original image proportions when stylizing.
   *
   * Algorithm: Linear distance minimization against known API ratios.
   *
   * @param ratio - The actual width/height ratio of the uploaded image
   * @returns API ratio string (e.g., "1:1", "9:16")
   */
  const getClosestApiRatio = (ratio: number): string => {
    const apiRatios = [
      { name: '1:1', value: 1 },
      { name: '4:5', value: 0.8 },
      { name: '9:16', value: 0.5625 },
      { name: '16:9', value: 1.778 },
      { name: '3:4', value: 0.75 },
      { name: '4:3', value: 1.333 },
      { name: '2:3', value: 0.667 },
      { name: '3:2', value: 1.5 },
    ];
    let closest = apiRatios[0];
    let minDiff = Math.abs(ratio - closest.value);
    for (const r of apiRatios) {
      const diff = Math.abs(ratio - r.value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }
    return closest.name;
  };

  // ============================================================================
  // BATCH GENERATION STATE
  // These 4 state variables work together to enable multi-slide image generation:
  // - batchMode: UI toggle for checkbox selection mode
  // - selectedSlideIds: Which slides are checked for batch generation
  // - batchGenerating: Global "in progress" flag
  // - slideGenerationStatus: Per-slide status for progress indicators
  // ============================================================================
  const [batchMode, setBatchMode] = useState(false);
  const [selectedSlideIds, setSelectedSlideIds] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [slideGenerationStatus, setSlideGenerationStatus] = useState<Record<string, 'idle' | 'generating' | 'success' | 'error'>>({});

  // ============================================================================
  // API KEY MANAGEMENT (in-workspace override)
  // ============================================================================
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyDisplay, setApiKeyDisplay] = useState(getApiKeyMasked());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Reset modal state when switching slides (fixes the "can't interact with other slides" bug)
  useEffect(() => {
    setShowUploadModal(false);
    setPendingUploadImage(null);
    setStylizePrompt('');
  }, [activeSlideId]);

  const activeIndex = slides.findIndex(s => s.id === activeSlideId);
  const activeSlide = slides[activeIndex];

  const handleTextChange = (text: string) => {
    const newSlides = [...slides];
    newSlides[activeIndex] = { ...activeSlide, content: text };
    onUpdateSlides(newSlides);
  };

  const handleToggleImage = (checked: boolean) => {
    const newSlides = [...slides];
    const isStoryteller = style === CarouselStyle.STORYTELLER;
    
    newSlides[activeIndex] = { 
        ...activeSlide, 
        showImage: checked, 
        imageScale: checked ? (activeSlide.imageScale || 45) : undefined, // Default to 45 for Storyteller
        overlayImage: isStoryteller ? true : undefined
    };
    onUpdateSlides(newSlides);
  };
  
  const handleToggleOverlay = (checked: boolean) => {
      const newSlides = [...slides];
      newSlides[activeIndex] = { ...activeSlide, overlayImage: checked };
      onUpdateSlides(newSlides);
  }

  const handleImageScaleChange = (scale: number) => {
      const newSlides = [...slides];
      newSlides[activeIndex] = { ...activeSlide, imageScale: scale };
      onUpdateSlides(newSlides);
  }

  const handleImageOffsetChange = (offset: number) => {
      const newSlides = [...slides];
      newSlides[activeIndex] = { ...activeSlide, imageOffsetY: offset };
      onUpdateSlides(newSlides);
  }

  const handleGradientHeightChange = (height: number) => {
      const newSlides = [...slides];
      newSlides[activeIndex] = { ...activeSlide, gradientHeight: height };
      onUpdateSlides(newSlides);
  }

  const handleDeleteSlide = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (slides.length <= 1) return;
    const newSlides = slides.filter(s => s.id !== activeSlideId);
    onUpdateSlides(newSlides);
    setActiveSlideId(newSlides[0].id);
  };

  const handleAddSlide = () => {
    const isStoryteller = style === CarouselStyle.STORYTELLER;
    const newSlide: Slide = {
      id: crypto.randomUUID(),
      type: SlideType.CONTENT,
      content: "New slide content...",
      showImage: false,
      imageScale: isStoryteller ? 45 : 50,
      overlayImage: isStoryteller ? true : undefined
    };
    const newSlides = [...slides];
    newSlides.splice(activeIndex + 1, 0, newSlide);
    onUpdateSlides(newSlides);
    setActiveSlideId(newSlide.id);
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dataUri = event.target.result as string;
          // Extract mime type and raw base64
          const mimeMatch = dataUri.match(/^data:(image\/\w+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
          const rawBase64 = dataUri.replace(/^data:image\/\w+;base64,/, '');

          // Create an Image to detect dimensions
          const img = new Image();
          img.onload = () => {
            const width = img.width;
            const height = img.height;
            const ratio = width / height;
            const detectedRatio = getClosestApiRatio(ratio);

            setPendingUploadImage({
              base64: dataUri,
              rawBase64: rawBase64,
              mimeType: mimeType,
              width,
              height,
              detectedRatio
            });
            setShowUploadModal(true);
          };
          img.src = dataUri;
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset the input so same file can be selected again
    if (e.target) e.target.value = '';
  };

  const handleUseImageAsIs = () => {
    if (!pendingUploadImage) return;

    const newSlides = [...slides];
    const isStoryteller = style === CarouselStyle.STORYTELLER;
    newSlides[activeIndex] = {
      ...activeSlide,
      showImage: true,
      imageUrl: pendingUploadImage.base64,
      imageScale: activeSlide.imageScale || (isStoryteller ? 45 : 50),
      overlayImage: isStoryteller ? true : undefined
    };
    onUpdateSlides(newSlides);

    // Reset modal state
    setShowUploadModal(false);
    setPendingUploadImage(null);
    setStylizePrompt('');
  };

  const handleStylizeImage = async () => {
    if (!pendingUploadImage || !stylizePrompt.trim() || !activeSlide) return;

    // Capture slide ID at call time
    const slideId = activeSlide.id;

    setIsStylizing(true);
    try {
      // Use the detected ratio from the original image to preserve proportions
      const stylizedImage = await stylizeImage(
        pendingUploadImage.rawBase64,
        pendingUploadImage.mimeType,
        stylizePrompt,
        pendingUploadImage.detectedRatio,  // Use detected, not global aspect ratio
        selectedImageModel
      );

      // Use ref to get latest slides (avoids stale closure)
      const currentSlides = slidesRef.current;
      const slideIndex = currentSlides.findIndex(s => s.id === slideId);

      // Handle case where slide was deleted during stylization
      if (slideIndex === -1) {
        console.warn('Slide was deleted during image stylization');
        return;
      }

      const slide = currentSlides[slideIndex];
      const newSlides = [...currentSlides];
      const isStoryteller = style === CarouselStyle.STORYTELLER;
      newSlides[slideIndex] = {
        ...slide,
        showImage: true,
        imageUrl: stylizedImage,
        imageScale: slide.imageScale || (isStoryteller ? 45 : 50),
        overlayImage: isStoryteller ? true : undefined
      };
      onUpdateSlides(newSlides);

      // Reset modal state
      setShowUploadModal(false);
      setPendingUploadImage(null);
      setStylizePrompt('');
    } catch (error) {
      console.error("Stylization failed:", error);
      alert("Failed to stylize image. Try again or use the image as-is.");
    } finally {
      setIsStylizing(false);
    }
  };

  const handleCancelUpload = () => {
    setShowUploadModal(false);
    setPendingUploadImage(null);
    setStylizePrompt('');
  };

  // ============================================================================
  // AI IMAGE EDITING HANDLERS
  // ============================================================================

  /**
   * Opens the AI image edit modal for the current slide.
   */
  const handleOpenEditModal = () => {
    if (!activeSlide?.imageUrl) return;
    setShowEditImageModal(true);
  };

  /**
   * Closes the AI image edit modal and resets state.
   */
  const handleCloseEditModal = () => {
    setShowEditImageModal(false);
    setEditImagePrompt('');
  };

  /**
   * Applies AI editing to the current slide's image.
   *
   * ASYNC PATTERN: Same as stylizeImage - captures slideId early,
   * uses slidesRef for current state to avoid stale closures.
   */
  const handleEditImage = async () => {
    if (!activeSlide?.imageUrl || !editImagePrompt.trim()) return;

    // Capture slide ID at call time
    const slideId = activeSlide.id;
    const currentImageUrl = activeSlide.imageUrl;

    setIsEditingImage(true);
    try {
      // Extract base64 and mimeType from data URI
      const mimeMatch = currentImageUrl.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const rawBase64 = currentImageUrl.replace(/^data:image\/\w+;base64,/, '');

      // Detect aspect ratio from current image
      const img = new Image();
      img.src = currentImageUrl;
      await new Promise<void>((resolve) => {
        if (img.complete) resolve();
        else img.onload = () => resolve();
      });
      const ratio = img.width / img.height;
      const detectedRatio = getClosestApiRatio(ratio);

      // Call the edit API
      const editedImage = await editImage(
        rawBase64,
        mimeType,
        editImagePrompt,
        detectedRatio,
        selectedImageModel
      );

      // Use ref to get latest slides (avoids stale closure)
      const currentSlides = slidesRef.current;
      const slideIndex = currentSlides.findIndex(s => s.id === slideId);

      // Handle case where slide was deleted during editing
      if (slideIndex === -1) {
        console.warn('Slide was deleted during image editing');
        return;
      }

      const slide = currentSlides[slideIndex];
      const newSlides = [...currentSlides];
      newSlides[slideIndex] = {
        ...slide,
        imageUrl: editedImage
      };
      onUpdateSlides(newSlides);

      // Close modal and reset
      setShowEditImageModal(false);
      setEditImagePrompt('');
    } catch (error) {
      console.error("Image editing failed:", error);
      alert("Failed to edit image. Please try again.");
    } finally {
      setIsEditingImage(false);
    }
  };

  // ============================================================================
  // AI CONTENT REFINEMENT HANDLERS
  // ============================================================================

  /**
   * Refines all slides based on global feedback.
   * E.g., "Translate to Spanish", "Make more technical", "Make it more fun"
   */
  const handleGlobalRefine = async () => {
    if (!globalFeedback.trim() || isRefining) return;

    setIsRefining(true);
    try {
      const refinedSlides = await refineCarouselContent(slides, globalFeedback);
      onUpdateSlides(refinedSlides);
      setGlobalFeedback('');
    } catch (error) {
      console.error("Failed to refine content:", error);
      alert("Failed to refine content. Please try again.");
    } finally {
      setIsRefining(false);
    }
  };

  /**
   * Refines a single slide based on per-slide feedback.
   */
  const handleSlideRefine = async () => {
    if (!slideFeedback.trim() || isRefining || !activeSlide) return;

    setIsRefining(true);
    try {
      const refinedSlides = await refineCarouselContent(slides, slideFeedback, activeIndex);
      onUpdateSlides(refinedSlides);
      setSlideFeedback('');
    } catch (error) {
      console.error("Failed to refine slide:", error);
      alert("Failed to refine slide. Please try again.");
    } finally {
      setIsRefining(false);
    }
  };

  // ============================================================================
  // PROJECT EXPORT/IMPORT HANDLERS
  // ============================================================================

  const projectImportRef = useRef<HTMLInputElement>(null);

  /**
   * Exports the current carousel project as a JSON file.
   * Includes all slides, profile, and global settings.
   */
  const handleExportProject = () => {
    const project: CarouselProject = {
      id: crypto.randomUUID(),
      name: `carousel-${new Date().toISOString().split('T')[0]}`,
      style,
      aspectRatio,
      profile,
      slides,
      theme,
      accentColor,
      showAccent,
      showSlideNumbers,
      showVerifiedBadge,
      headerScale,
      fontStyle,
      fontScale,
      globalImageStyle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    window.saveAs(blob, `${project.name}.json`);
  };

  /**
   * Imports a carousel project from a JSON file.
   * Restores all slides and global settings.
   */
  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const project = JSON.parse(event.target?.result as string) as CarouselProject;

        // Validate required fields
        if (!project.slides || !Array.isArray(project.slides)) {
          throw new Error('Invalid project file: missing slides');
        }

        // Restore slides
        onUpdateSlides(project.slides);

        // Restore global settings (with fallbacks for older project files)
        if (project.theme) setTheme(project.theme);
        if (project.accentColor) setAccentColor(project.accentColor);
        if (project.showAccent !== undefined) setShowAccent(project.showAccent);
        if (project.showSlideNumbers !== undefined) setShowSlideNumbers(project.showSlideNumbers);
        if (project.showVerifiedBadge !== undefined) setShowVerifiedBadge(project.showVerifiedBadge);
        if (project.headerScale) setHeaderScale(project.headerScale);
        if (project.fontStyle) setFontStyle(project.fontStyle);
        if (project.fontScale) setFontScale(project.fontScale);
        if (project.globalImageStyle) setGlobalImageStyle(project.globalImageStyle);

        // Set active slide to first slide
        if (project.slides.length > 0) {
          setActiveSlideId(project.slides[0].id);
        }

        alert('Project imported successfully!');
      } catch (error) {
        console.error('Failed to import project:', error);
        alert('Failed to import project. Please check the file format.');
      }
    };

    reader.readAsText(file);

    // Reset input so same file can be imported again
    if (e.target) e.target.value = '';
  };

  // ============================================================================
  // STYLE CONVERSION HANDLER
  // ============================================================================

  /**
   * Converts the carousel between Twitter and Storyteller styles.
   * Adjusts slide properties for optimal display in the new style.
   */
  const handleConvertStyle = () => {
    if (!onStyleChange) return;

    const newStyle = style === CarouselStyle.TWITTER
      ? CarouselStyle.STORYTELLER
      : CarouselStyle.TWITTER;

    // Adjust slide properties for the new style
    const convertedSlides = slides.map(slide => ({
      ...slide,
      // Reset style-specific layout properties
      overlayImage: newStyle === CarouselStyle.STORYTELLER ? true : undefined,
      imageScale: newStyle === CarouselStyle.STORYTELLER ? 45 : 50,
      contentLayout: undefined, // Reset to default for new style
    }));

    onUpdateSlides(convertedSlides);
    onStyleChange(newStyle);
  };

  // ============================================================================
  // IMAGE GENERATION HANDLERS
  // ============================================================================

  /**
   * Generates an AI image for the currently active slide.
   *
   * ASYNC PATTERN: Captures slideId early, uses slidesRef for current state.
   * This allows concurrent generation on multiple slides without data loss.
   */
  const handleGenerateImage = async () => {
    if (!activeSlide) return;

    // Capture slide ID and prompt at call time (not the whole slide object)
    // This ensures we update the correct slide even if user switches slides during generation
    const slideId = activeSlide.id;
    const prompt = activeSlide.imagePrompt || `An abstract representation of: ${activeSlide.content.substring(0, 50)}`;

    // Add this slide to generating set (allows concurrent generation)
    setGeneratingSlideIds(prev => new Set(prev).add(slideId));

    try {
      const base64Image = await generateSlideImage(prompt, imageAspectRatio, selectedImageModel, globalImageStyle);

      // Use ref to get latest slides (avoids stale closure)
      const currentSlides = slidesRef.current;
      const slideIndex = currentSlides.findIndex(s => s.id === slideId);

      // Handle case where slide was deleted during generation
      if (slideIndex === -1) {
        console.warn('Slide was deleted during image generation');
        return;
      }

      const slide = currentSlides[slideIndex];
      const newSlides = [...currentSlides];
      const isStoryteller = style === CarouselStyle.STORYTELLER;
      newSlides[slideIndex] = {
          ...slide,
          showImage: true,
          imageUrl: base64Image,
          imageScale: slide.imageScale || (isStoryteller ? 45 : 50),
          overlayImage: isStoryteller ? true : undefined
      };
      onUpdateSlides(newSlides);
    } catch (error) {
      console.error(error);
      alert("Failed to generate image. Try again or check the console for details.");
    } finally {
      // Remove this slide from generating set
      setGeneratingSlideIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(slideId);
        return newSet;
      });
    }
  };

  /**
   * Generates a background image for the current slide using AI.
   * Uses user-provided prompt or falls back to slide content.
   * Background images are full-bleed and work with a color overlay.
   */
  const handleGenerateBackgroundImage = async () => {
    if (!activeSlide) return;

    const slideId = activeSlide.id;

    // Use user prompt if provided, otherwise create one from slide content
    let prompt: string;
    if (backgroundPrompt.trim()) {
      prompt = backgroundPrompt.trim();
    } else {
      const contentSnippet = activeSlide.content.substring(0, 100).replace(/[#*_~]/g, '');
      prompt = `Abstract atmospheric background for: ${contentSnippet}. Soft lighting, blurred details, suitable as text background.`;
    }

    setGeneratingBackgroundIds(prev => new Set(prev).add(slideId));

    try {
      // Use 1:1 aspect ratio for backgrounds (works well with any slide ratio)
      const base64Image = await generateSlideImage(prompt, '1/1', selectedImageModel, globalImageStyle);

      const currentSlides = slidesRef.current;
      const slideIndex = currentSlides.findIndex(s => s.id === slideId);

      if (slideIndex === -1) {
        console.warn('Slide was deleted during background image generation');
        return;
      }

      const slide = currentSlides[slideIndex];
      const newSlides = [...currentSlides];
      newSlides[slideIndex] = {
        ...slide,
        showBackgroundImage: true,
        backgroundImageUrl: base64Image
      };
      onUpdateSlides(newSlides);
    } catch (error) {
      console.error(error);
      alert("Failed to generate background image. Try again or check the console for details.");
    } finally {
      setGeneratingBackgroundIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(slideId);
        return newSet;
      });
    }
  };

  // Capture globalImageStyle at call time to avoid stale closure in batch generation
  const globalImageStyleRef = useRef(globalImageStyle);
  useEffect(() => {
    globalImageStyleRef.current = globalImageStyle;
  }, [globalImageStyle]);

  /**
   * Generates images for multiple slides simultaneously.
   *
   * PATTERN: Promise.allSettled for parallel operations
   * - All selected slides generate images concurrently
   * - Individual failures don't stop other generations
   * - Per-slide status tracking shows progress in UI
   *
   * FLOW:
   * 1. Set all selected slides to "generating" status
   * 2. Fire off all generation requests in parallel
   * 3. Wait for ALL to complete (success or failure)
   * 4. Update slides with successful images
   * 5. Show success/error status for 3 seconds, then reset
   */
  const handleBatchGenerateImages = async () => {
    if (selectedSlideIds.size === 0) return;

    setBatchGenerating(true);

    // Capture the current image style at call time to use in all promises
    const currentImageStyle = globalImageStyleRef.current;

    // Initialize all selected slides as "generating" for UI feedback
    const initialStatus: Record<string, 'idle' | 'generating' | 'success' | 'error'> = {};
    selectedSlideIds.forEach(id => {
      initialStatus[id] = 'generating';
    });
    setSlideGenerationStatus(initialStatus);

    // Create array of generation promises (all run concurrently)
    const generationPromises = Array.from(selectedSlideIds).map(async (slideId) => {
      const slideIndex = slides.findIndex(s => s.id === slideId);
      if (slideIndex === -1) return { slideId, success: false };

      const slide = slides[slideIndex];
      const prompt = slide.imagePrompt ||
        `An abstract representation of: ${slide.content.substring(0, 50)}`;

      try {
        const base64Image = await generateSlideImage(prompt, imageAspectRatio, selectedImageModel, currentImageStyle);
        return { slideId, success: true, imageUrl: base64Image };
      } catch (error) {
        console.error(`Failed to generate image for slide ${slideId}:`, error);
        return { slideId, success: false };
      }
    });

    // Execute all in parallel using Promise.allSettled
    const results = await Promise.allSettled(generationPromises);

    // Process results and update slides
    const newSlides = [...slides];
    const newStatus: Record<string, 'idle' | 'generating' | 'success' | 'error'> = {};
    const isStoryteller = style === CarouselStyle.STORYTELLER;

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { slideId, success, imageUrl } = result.value;
        newStatus[slideId] = success ? 'success' : 'error';

        if (success && imageUrl) {
          const slideIndex = newSlides.findIndex(s => s.id === slideId);
          if (slideIndex !== -1) {
            newSlides[slideIndex] = {
              ...newSlides[slideIndex],
              showImage: true,
              imageUrl: imageUrl,
              imageScale: newSlides[slideIndex].imageScale || (isStoryteller ? 45 : 50),
              overlayImage: isStoryteller ? true : undefined
            };
          }
        }
      }
    });

    onUpdateSlides(newSlides);
    setSlideGenerationStatus(newStatus);
    setBatchGenerating(false);

    // Clear status after 3 seconds
    setTimeout(() => {
      setSlideGenerationStatus({});
      setSelectedSlideIds(new Set());
      setBatchMode(false);
    }, 3000);
  };

  const toggleSlideSelection = (slideId: string) => {
    setSelectedSlideIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(slideId)) {
        newSet.delete(slideId);
      } else {
        newSet.add(slideId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSlideIds.size === slides.length) {
      setSelectedSlideIds(new Set());
    } else {
      setSelectedSlideIds(new Set(slides.map(s => s.id)));
    }
  };

  // ============================================================================
  // PNG EXPORT (Download Logic)
  // ============================================================================

  /**
   * Waits for all <img> elements within an element to finish loading.
   */
  const waitForImages = (element: HTMLElement): Promise<void> => {
      return new Promise((resolve) => {
          const images = element.querySelectorAll('img');

          if (images.length === 0) {
              resolve();
              return;
          }

          let loaded = 0;
          const total = images.length;

          const checkDone = () => {
              loaded++;
              if (loaded >= total) resolve();
          };

          images.forEach((img) => {
              if (img.complete && img.naturalHeight > 0) {
                  checkDone();
              } else {
                  img.onload = checkDone;
                  img.onerror = checkDone;
              }
          });

          // Safety timeout
          setTimeout(resolve, 3000);
      });
  };

  /**
   * Captures the visible preview element as a PNG image.
   * Waits for all images to load before capturing.
   */
  const captureSlide = async (): Promise<Blob | null> => {
      const element = document.getElementById('preview-slide-capture');
      if (!element) return null;

      await waitForImages(element);

      const bgColor = theme === 'DARK' ? '#0a0a0a' : '#FFFFFF';

      try {
          const dataUrl = await window.htmlToImage.toPng(element, {
              width: PREVIEW_WIDTH,
              height: previewHeight,
              backgroundColor: bgColor,
              pixelRatio: 1,
              skipFonts: false,
              cacheBust: true
          });

          const response = await fetch(dataUrl);
          return await response.blob();
      } catch (err) {
          console.error("Capture failed:", err);
          return null;
      }
  };

  const handleDownloadSlide = async () => {
      if (isDownloading) return;
      setIsDownloading(true);

      // Capture the visible preview directly
      const blob = await captureSlide();

      if (blob) {
          window.saveAs(blob, `slide-${activeIndex + 1}.png`);
      } else {
          alert("Could not generate image. Please try again.");
      }
      setIsDownloading(false);
  };

  const handleDownloadCarousel = async () => {
      if (isDownloading) return;
      setIsDownloading(true);

      const zip = new window.JSZip();
      const originalActiveId = activeSlideId;

      for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];

          // Switch to this slide and wait for React to re-render
          setActiveSlideId(slide.id);
          await new Promise(resolve => setTimeout(resolve, 300));

          const blob = await captureSlide();
          if (blob) {
              zip.file(`slide-${i + 1}.png`, blob);
          }
      }

      // Restore original active slide
      setActiveSlideId(originalActiveId);

      const content = await zip.generateAsync({ type: "blob" });
      window.saveAs(content, "instagram-carousel.zip");

      setIsDownloading(false);
  };

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setApiKeyDisplay(getApiKeyMasked());
      setApiKeyInput('');
      setShowApiKeyInput(false);
    }
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
      if (!textAreaRef.current) return;
      const textarea = textAreaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = activeSlide.content;
      const selectedText = text.substring(start, end);
      const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
      handleTextChange(newText);
      setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      }, 0);
  };

  const PREVIEW_WIDTH = 1080;
  const getPreviewHeight = () => {
    switch (aspectRatio) {
      case '1/1': return PREVIEW_WIDTH;          // 1080x1080
      case '4/5': return PREVIEW_WIDTH * 1.25;   // 1080x1350
      case '9/16': return PREVIEW_WIDTH * (16/9); // 1080x1920
      case '16/9': return PREVIEW_WIDTH * (9/16); // 1080x607.5
      default: return PREVIEW_WIDTH;
    }
  };
  const previewHeight = getPreviewHeight();

  const renderSlide = (slide: Slide, idx: number, isExport: boolean) => {
      const commonProps = {
        slide: slide,
        profile: profile,
        index: idx,
        total: slides.length,
        showSlideNumbers: showSlideNumbers,
        showVerifiedBadge: showVerifiedBadge,
        headerScale: headerScale,
        theme: theme,
        accentColor: showAccent ? accentColor : undefined,
        forExport: isExport,
        fontStyle: fontStyle,
        fontScale: fontScale
      };

      if (style === CarouselStyle.STORYTELLER) {
          return <StorytellerSlide {...commonProps} />;
      }
      return <TwitterSlide {...commonProps} />;
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* AI Image Edit Modal */}
      {showEditImageModal && activeSlide?.imageUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-border">
            <h3 className="text-lg font-bold text-foreground mb-4">Edit Image with AI</h3>

            {/* Current Image Preview */}
            <div className="w-full max-w-[200px] mx-auto mb-4 rounded-lg overflow-hidden border border-border">
              <img
                src={activeSlide.imageUrl}
                alt="Current"
                className="w-full h-auto object-contain"
              />
            </div>

            {/* Edit Prompt */}
            <div className="space-y-3">
              <Label className="text-sm text-muted-foreground font-medium">
                Describe your edit
              </Label>
              <Textarea
                value={editImagePrompt}
                onChange={(e) => setEditImagePrompt(e.target.value)}
                placeholder="e.g., 'Make it nighttime', 'Add rain', 'Change the background to a beach'"
                className="w-full h-24 resize-none"
                disabled={isEditingImage}
              />
              <Button
                onClick={handleEditImage}
                disabled={isEditingImage || !editImagePrompt.trim()}
                className="w-full"
              >
                {isEditingImage ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                    Editing...
                  </>
                ) : (
                  'Apply Edit'
                )}
              </Button>
            </div>

            {/* Cancel */}
            <Button
              variant="ghost"
              onClick={handleCloseEditModal}
              disabled={isEditingImage}
              className="w-full mt-4 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Image Upload Modal */}
      {showUploadModal && pendingUploadImage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-border">
            <h3 className="text-lg font-bold text-foreground mb-4">Image Options</h3>

            {/* Preview */}
            <div className="w-full max-w-[200px] mx-auto mb-4 rounded-lg overflow-hidden border border-border">
              <img
                src={pendingUploadImage.base64}
                alt="Preview"
                className="w-full h-auto object-contain"
              />
            </div>
            {/* Detected ratio info */}
            <p className="text-center text-muted-foreground text-xs mb-4">
              Detected: {pendingUploadImage.width}x{pendingUploadImage.height} ({pendingUploadImage.detectedRatio})
            </p>

            {/* Options */}
            <div className="space-y-4">
              {/* Use As-Is Button */}
              <Button
                variant="secondary"
                onClick={handleUseImageAsIs}
                disabled={isStylizing}
                className="w-full"
              >
                Use as-is
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border"></div>
                <span className="text-muted-foreground text-sm">or</span>
                <div className="flex-1 h-px bg-border"></div>
              </div>

              {/* Stylize Section */}
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground font-medium">
                  Stylize with AI (Nano Banana)
                </Label>
                <Textarea
                  value={stylizePrompt}
                  onChange={(e) => setStylizePrompt(e.target.value)}
                  placeholder="e.g., 'Make it look like a watercolor painting' or 'Add neon cyberpunk aesthetic'"
                  className="w-full h-20 resize-none"
                  disabled={isStylizing}
                />
                <Button
                  onClick={handleStylizeImage}
                  disabled={isStylizing || !stylizePrompt.trim()}
                  className="w-full"
                >
                  {isStylizing ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5 mr-2" />
                      Stylizing...
                    </>
                  ) : (
                    'Stylize with AI'
                  )}
                </Button>
              </div>
            </div>

            {/* Cancel */}
            <Button
              variant="ghost"
              onClick={handleCancelUpload}
              disabled={isStylizing}
              className="w-full mt-4 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Sidebar: Slide List */}
      <div className="w-64 border-r border-border flex flex-col bg-card flex-shrink-0 z-20">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-bold text-lg">Slides</h2>
          <div className="flex items-center gap-2">
            {/* Batch Mode Toggle */}
            <Button
              variant={batchMode ? "default" : "ghost"}
              size="icon"
              onClick={() => {
                setBatchMode(!batchMode);
                if (batchMode) {
                  setSelectedSlideIds(new Set());
                  setSlideGenerationStatus({});
                }
              }}
              disabled={batchGenerating}
              title={batchMode ? 'Exit Batch Mode' : 'Batch Generate Images'}
            >
              <Image className="h-5 w-5" />
            </Button>

            {/* Add Slide Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleAddSlide}
              className="text-primary hover:text-primary"
              title="Add Slide"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Batch Mode Controls */}
          {batchMode && (
            <div className="p-2 bg-secondary rounded-lg mb-2 space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  variant="link"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="text-xs text-primary p-0 h-auto"
                >
                  {selectedSlideIds.size === slides.length ? 'Deselect All' : 'Select All'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedSlideIds.size} selected
                </span>
              </div>
              <Button
                onClick={handleBatchGenerateImages}
                disabled={selectedSlideIds.size === 0 || batchGenerating}
                className="w-full text-xs"
                size="sm"
              >
                {batchGenerating ? 'Generating...' : `Generate ${selectedSlideIds.size} Images`}
              </Button>
            </div>
          )}
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              onClick={() => !batchMode && setActiveSlideId(slide.id)}
              className={cn(
                "p-3 rounded-lg cursor-pointer transition-all border",
                activeSlideId === slide.id && !batchMode
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-secondary border-transparent hover:bg-secondary/80",
                batchMode && "cursor-default"
              )}
            >
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  {/* Checkbox for batch mode */}
                  {batchMode && (
                    <input
                      type="checkbox"
                      checked={selectedSlideIds.has(slide.id)}
                      onChange={() => toggleSlideSelection(slide.id)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                    {slide.type} {idx + 1}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Generation Status Indicator (batch mode) */}
                  {slideGenerationStatus[slide.id] && (
                    <span className={`text-xs ${
                      slideGenerationStatus[slide.id] === 'generating' ? 'text-yellow-400 animate-pulse' :
                      slideGenerationStatus[slide.id] === 'success' ? 'text-green-400' :
                      slideGenerationStatus[slide.id] === 'error' ? 'text-red-400' : ''
                    }`}>
                      {slideGenerationStatus[slide.id] === 'generating' && '...'}
                      {slideGenerationStatus[slide.id] === 'success' && '✓'}
                      {slideGenerationStatus[slide.id] === 'error' && '✗'}
                    </span>
                  )}

                  {/* Individual generation indicator (non-batch mode) */}
                  {!slideGenerationStatus[slide.id] && generatingSlideIds.has(slide.id) && (
                    <span className="text-xs text-primary animate-pulse">...</span>
                  )}

                  {!batchMode && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDeleteSlide}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm truncate opacity-90">{slide.content}</p>

              {/* Image indicator */}
              {slide.showImage && (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Image className="w-3 h-3" />
                  {slide.imageUrl ? 'Has image' : 'Needs image'}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border">
           <Button variant="ghost" onClick={onBack} className="text-muted-foreground hover:text-foreground text-sm">
             <ArrowLeft className="h-4 w-4 mr-1" />
             Back to Setup
           </Button>
        </div>
      </div>

      {/* Main Area: Preview & Tools */}
      <div className="flex-1 flex flex-col relative bg-background min-w-0">

        {/* Toolbar */}
        <div className="h-16 border-b border-border bg-card px-6 flex items-center justify-between flex-shrink-0 z-20">
            <div className="flex items-center gap-6">
                 <div>
                    <h1 className="font-bold text-xl">Workspace</h1>
                    <span className="text-xs text-muted-foreground">
                        {aspectRatio === '1/1' ? 'Square 1:1' : 'Portrait 4:5'} (1080px)
                    </span>
                 </div>

                 {/* Zoom Control */}
                 <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Zoom</span>
                    <Slider
                        value={[zoomLevel]}
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        onValueChange={(value) => setZoomLevel(value[0])}
                        className="w-24"
                    />
                 </div>
            </div>
            <div className="flex space-x-3 items-center">
                 {/* Editor Theme Toggle */}
                 {onEditorThemeToggle && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onEditorThemeToggle}
                        title={editorTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    >
                        {editorTheme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                    </Button>
                 )}
                 <div className="w-px bg-border h-8"></div>
                 {/* Project Import (hidden file input) */}
                 <input
                   type="file"
                   ref={projectImportRef}
                   className="hidden"
                   accept=".json"
                   onChange={handleImportProject}
                 />
                 <Button
                   variant="outline"
                   onClick={() => projectImportRef.current?.click()}
                   title="Import project from JSON"
                 >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Import
                 </Button>
                 <Button
                   variant="outline"
                   onClick={handleExportProject}
                   title="Export project as JSON"
                 >
                    <Save className="h-4 w-4 mr-2" />
                    Export
                 </Button>
                 <div className="w-px bg-border h-8"></div>
                 <Button
                   variant="outline"
                   onClick={handleDownloadSlide}
                   disabled={isDownloading}
                 >
                    <FileDown className="h-4 w-4 mr-2" />
                    {isDownloading ? '...' : 'Download Slide'}
                 </Button>
                 <Button
                   onClick={handleDownloadCarousel}
                   disabled={isDownloading}
                 >
                    <FolderDown className="h-4 w-4 mr-2" />
                    {isDownloading ? 'Zipping...' : 'Download Carousel'}
                 </Button>
            </div>
        </div>

        {/* Content Wrapper */}
        <div className="flex-1 flex overflow-hidden">

            {/* Center: Canvas Preview */}
            <div className="flex-1 bg-black flex items-center justify-center overflow-hidden relative">
                {/* Scrollable Container */}
                <div className="w-full h-full overflow-auto flex items-center justify-center p-10">
                    <div
                        style={{
                            transform: `scale(${zoomLevel})`,
                            transformOrigin: 'center center',
                            transition: 'transform 0.2s ease-out'
                        }}
                        className="flex-shrink-0"
                    >
                        <div
                            id="preview-slide-capture"
                            className="relative shadow-2xl bg-white"
                            style={{
                                width: `${PREVIEW_WIDTH}px`,
                                height: `${previewHeight}px`
                            }}
                        >
                            {renderSlide(activeSlide, activeIndex, false)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel: Properties */}
            <div className="w-96 bg-card border-l border-border p-6 flex flex-col overflow-y-auto flex-shrink-0 z-20">
                
                {/* Global Settings Section */}
                <div className="mb-6 border-b border-border pb-6">
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-4">Global Settings</h3>

                    {/* Style Conversion */}
                    {onStyleChange && (
                        <div className="mb-4 p-3 bg-secondary rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-foreground block">Current Style</span>
                                    <span className="text-xs text-muted-foreground">
                                        {style === CarouselStyle.TWITTER ? 'Twitter' : 'Storyteller'}
                                    </span>
                                </div>
                                <Button
                                    onClick={handleConvertStyle}
                                    size="sm"
                                    variant="secondary"
                                    className="bg-purple-600 hover:bg-purple-500 text-white"
                                >
                                    Convert to {style === CarouselStyle.TWITTER ? 'Storyteller' : 'Twitter'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* API Key Management */}
                    <div className="mb-4 p-3 bg-secondary rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium">Gemini API Key</Label>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                          className="text-xs text-primary p-0 h-auto"
                        >
                          {showApiKeyInput ? 'Cancel' : 'Change'}
                        </Button>
                      </div>
                      {!showApiKeyInput ? (
                        <div className="text-xs text-muted-foreground font-mono">
                          {apiKeyDisplay || 'Not set'}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="Enter your Gemini API key"
                          />
                          <Button
                            onClick={handleSaveApiKey}
                            disabled={!apiKeyInput.trim()}
                            className="w-full"
                            size="sm"
                          >
                            Save API Key
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Dark/Light Mode Toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <Label className="text-sm font-medium">Theme</Label>
                        <div className="flex bg-secondary rounded-lg p-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setTheme('LIGHT')}
                                className={cn(
                                    "px-3 py-1 text-xs font-bold",
                                    theme === 'LIGHT' ? 'bg-white text-black shadow' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <Sun className="h-3 w-3 mr-1" />
                                Light
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setTheme('DARK')}
                                className={cn(
                                    "px-3 py-1 text-xs font-bold",
                                    theme === 'DARK' ? 'bg-black text-white shadow' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <Moon className="h-3 w-3 mr-1" />
                                Dark
                            </Button>
                        </div>
                    </div>

                     {/* Accent Color Toggle & Picker */}
                    <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium">Use Accent Color</Label>
                        <Switch
                            checked={showAccent}
                            onCheckedChange={setShowAccent}
                        />
                    </div>

                    {showAccent && (
                        <div className="flex items-center gap-3 mb-4 bg-secondary p-2 rounded-lg border border-border">
                            <input
                                type="color"
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                                title="Pick a color"
                            />
                            <Input
                                type="text"
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                className="flex-1 font-mono uppercase"
                                maxLength={7}
                                placeholder="#RRGGBB"
                            />
                        </div>
                    )}

                    {/* Slide Numbers Toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <Label className="text-sm font-medium">Slide Numbers</Label>
                        <Switch
                            checked={showSlideNumbers}
                            onCheckedChange={setShowSlideNumbers}
                        />
                    </div>

                    {/* Verified Badge Toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <Label className="text-sm font-medium">Verified Badge</Label>
                        <Switch
                            checked={showVerifiedBadge}
                            onCheckedChange={setShowVerifiedBadge}
                        />
                    </div>

                    {/* Header Scale Slider */}
                    <div className="mb-4">
                        <div className="flex justify-between text-xs text-muted-foreground mb-2">
                            <span>Header/Footer Size</span>
                            <span>{Math.round(headerScale * 100)}%</span>
                        </div>
                        <Slider
                            value={[headerScale]}
                            min={0.5}
                            max={2.0}
                            step={0.1}
                            onValueChange={(value) => setHeaderScale(value[0])}
                        />
                    </div>

                    {/* Font Style Selector */}
                    <div className="mb-4">
                        <Label className="text-sm font-medium mb-2 block">Font Style</Label>
                        <div className="flex bg-secondary rounded-lg p-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setFontStyle('MODERN')}
                                className={cn(
                                    "flex-1 px-2 py-1.5 text-xs font-bold",
                                    fontStyle === 'MODERN' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                Modern
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setFontStyle('SERIF')}
                                className={cn(
                                    "flex-1 px-2 py-1.5 text-xs font-bold",
                                    fontStyle === 'SERIF' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                                )}
                                style={{ fontFamily: '"Playfair Display", serif' }}
                            >
                                Serif
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setFontStyle('TECH')}
                                className={cn(
                                    "flex-1 px-2 py-1.5 text-xs font-bold",
                                    fontStyle === 'TECH' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                                )}
                                style={{ fontFamily: '"JetBrains Mono", monospace' }}
                            >
                                Tech
                            </Button>
                        </div>
                    </div>

                    {/* Font Size Slider */}
                    <div className="mb-4">
                        <div className="flex justify-between text-xs text-muted-foreground mb-2">
                            <span>Font Size</span>
                            <span>{Math.round(fontScale * 100)}%</span>
                        </div>
                        <Slider
                            value={[fontScale]}
                            min={0.5}
                            max={1.5}
                            step={0.05}
                            onValueChange={(value) => setFontScale(value[0])}
                        />
                    </div>

                    {/* Global Image Style */}
                    <div className="mb-4 p-3 bg-secondary rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium">Image Generation Style</Label>
                            <Button
                                variant="link"
                                size="sm"
                                onClick={() => setGlobalImageStyle(DEFAULT_IMAGE_STYLE)}
                                className="text-xs text-muted-foreground hover:text-foreground p-0 h-auto"
                                title="Reset to default"
                            >
                                Reset
                            </Button>
                        </div>
                        <Textarea
                            value={globalImageStyle}
                            onChange={(e) => setGlobalImageStyle(e.target.value)}
                            placeholder="Style prefix for all AI-generated images..."
                            className="w-full h-16 text-xs resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Applied to all AI-generated images</p>
                    </div>

                    {/* AI Content Refinement (Global) */}
                    <div className="p-3 bg-secondary rounded-lg">
                        <Label className="text-sm font-medium mb-2 block">
                            Refine All Slides with AI
                        </Label>
                        <Textarea
                            value={globalFeedback}
                            onChange={(e) => setGlobalFeedback(e.target.value)}
                            placeholder="E.g., 'Translate to Spanish', 'Make more technical', 'Make it more fun'"
                            className="w-full h-16 resize-none mb-2"
                            disabled={isRefining}
                        />
                        <Button
                            onClick={handleGlobalRefine}
                            disabled={!globalFeedback.trim() || isRefining}
                            className="w-full bg-purple-600 hover:bg-purple-500"
                            size="sm"
                        >
                            {isRefining ? (
                                <>
                                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                                    Refining...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Refine All Slides
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Edit Slide</h3>

                {/* Rich Text Toolbar */}
                <div className="flex space-x-1 mb-2 bg-secondary p-1 rounded-md">
                    <Button variant="ghost" size="sm" onClick={() => insertMarkdown('**', '**')} className="p-1.5 text-muted-foreground hover:text-foreground font-bold text-xs" title="Bold">B</Button>
                    <Button variant="ghost" size="sm" onClick={() => insertMarkdown('*', '*')} className="p-1.5 text-muted-foreground hover:text-foreground italic text-xs" title="Italic">I</Button>
                    <Button variant="ghost" size="sm" onClick={() => insertMarkdown('__', '__')} className="p-1.5 text-muted-foreground hover:text-foreground underline text-xs" title="Underline">U</Button>
                    <Button variant="ghost" size="sm" onClick={() => insertMarkdown('~~', '~~')} className="p-1.5 text-muted-foreground hover:text-foreground line-through text-xs" title="Strike">S</Button>
                    <div className="w-px bg-border mx-1"></div>
                    <Button variant="ghost" size="sm" onClick={() => insertMarkdown('# ')} className="p-1.5 text-muted-foreground hover:text-foreground font-bold text-xs" title="Heading 1">H1</Button>
                    <Button variant="ghost" size="sm" onClick={() => insertMarkdown('## ')} className="p-1.5 text-muted-foreground hover:text-foreground font-bold text-xs" title="Heading 2">H2</Button>
                    <div className="w-px bg-border mx-1"></div>
                    <Button variant="ghost" size="sm" onClick={() => insertMarkdown('- ')} className="p-1.5 text-muted-foreground hover:text-foreground text-xs" title="Bullet List">• List</Button>
                </div>

                <Textarea
                    ref={textAreaRef}
                    className="w-full min-h-[8rem] mb-3 resize-y font-mono"
                    value={activeSlide.content}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Enter text (Markdown supported)..."
                />

                {/* Per-Slide AI Refinement */}
                <div className="mb-4 flex gap-2">
                    <Input
                        type="text"
                        value={slideFeedback}
                        onChange={(e) => setSlideFeedback(e.target.value)}
                        placeholder="Refine this slide... (e.g., 'make it shorter')"
                        className="flex-1"
                        disabled={isRefining}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSlideRefine();
                            }
                        }}
                    />
                    <Button
                        onClick={handleSlideRefine}
                        disabled={!slideFeedback.trim() || isRefining}
                        size="icon"
                        className="bg-purple-600 hover:bg-purple-500"
                        title="Refine this slide"
                    >
                        {isRefining ? (
                            <Loader2 className="animate-spin h-4 w-4" />
                        ) : (
                            <Zap className="h-4 w-4" />
                        )}
                    </Button>
                </div>

                {/* Per-Slide Font Override */}
                <div className="mb-4 p-3 bg-secondary/50 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Slide Font Override</span>
                        <Button
                            variant="link"
                            size="sm"
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = {
                                    ...activeSlide,
                                    fontStyle: undefined,
                                    fontScale: undefined
                                };
                                onUpdateSlides(newSlides);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground p-0 h-auto"
                            title="Reset to global settings"
                        >
                            Reset
                        </Button>
                    </div>

                    {/* Per-Slide Font Style */}
                    <div className="flex bg-secondary rounded-lg p-1 mb-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontStyle: undefined };
                                onUpdateSlides(newSlides);
                            }}
                            className={cn(
                                "flex-1 px-1 py-1 text-[10px] font-bold",
                                !activeSlide.fontStyle ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Global
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontStyle: 'MODERN' };
                                onUpdateSlides(newSlides);
                            }}
                            className={cn(
                                "flex-1 px-1 py-1 text-[10px] font-bold",
                                activeSlide.fontStyle === 'MODERN' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Modern
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontStyle: 'SERIF' };
                                onUpdateSlides(newSlides);
                            }}
                            className={cn(
                                "flex-1 px-1 py-1 text-[10px] font-bold",
                                activeSlide.fontStyle === 'SERIF' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                            )}
                            style={{ fontFamily: '"Playfair Display", serif' }}
                        >
                            Serif
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontStyle: 'TECH' };
                                onUpdateSlides(newSlides);
                            }}
                            className={cn(
                                "flex-1 px-1 py-1 text-[10px] font-bold",
                                activeSlide.fontStyle === 'TECH' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                            )}
                            style={{ fontFamily: '"JetBrains Mono", monospace' }}
                        >
                            Tech
                        </Button>
                    </div>

                    {/* Per-Slide Font Size */}
                    <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Size</span>
                            <span>{activeSlide.fontScale !== undefined ? `${Math.round(activeSlide.fontScale * 100)}%` : 'Global'}</span>
                        </div>
                        <Slider
                            value={[activeSlide.fontScale !== undefined ? activeSlide.fontScale : fontScale]}
                            min={0.5}
                            max={1.5}
                            step={0.05}
                            onValueChange={(value) => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontScale: value[0] };
                                onUpdateSlides(newSlides);
                            }}
                        />
                    </div>
                </div>

                {/* ================================================================
                    BACKGROUND IMAGE SECTION
                    Full-bleed background with color overlay - separate from illustration
                    ================================================================ */}
                <div className="mb-4 p-3 bg-secondary/50 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-3">
                        <span className="font-semibold text-sm">Background Image</span>
                        <Switch
                            checked={activeSlide.showBackgroundImage || false}
                            onCheckedChange={(checked) => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, showBackgroundImage: checked };
                                onUpdateSlides(newSlides);
                            }}
                        />
                    </div>

                    {activeSlide.showBackgroundImage && (
                        <div className="space-y-3 animate-fade-in">
                            {/* Background Prompt Input */}
                            {!activeSlide.backgroundImageUrl && (
                                <div>
                                    <Input
                                        type="text"
                                        value={backgroundPrompt}
                                        onChange={(e) => setBackgroundPrompt(e.target.value)}
                                        placeholder="Describe background (or leave empty for auto)"
                                        className="text-xs"
                                    />
                                </div>
                            )}

                            {/* Background Image Preview / Upload */}
                            {activeSlide.backgroundImageUrl ? (
                                <div className="relative aspect-video rounded-md overflow-hidden border border-border">
                                    <img src={activeSlide.backgroundImageUrl} alt="Background" className="w-full h-full object-cover" />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const newSlides = [...slides];
                                            newSlides[activeIndex] = { ...activeSlide, backgroundImageUrl: undefined };
                                            onUpdateSlides(newSlides);
                                        }}
                                        className="absolute top-1 right-1 bg-black/50 hover:bg-destructive text-white h-6 w-6"
                                        title="Remove background"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    {/* Upload Button */}
                                    <label className="flex-1">
                                        <Button variant="secondary" className="w-full text-xs" asChild>
                                            <span className="flex items-center justify-center gap-2 cursor-pointer">
                                                <Upload className="h-4 w-4" />
                                                Upload
                                            </span>
                                        </Button>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (ev) => {
                                                        const newSlides = [...slides];
                                                        newSlides[activeIndex] = {
                                                            ...activeSlide,
                                                            backgroundImageUrl: ev.target?.result as string
                                                        };
                                                        onUpdateSlides(newSlides);
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                    </label>
                                    {/* AI Generate Button */}
                                    <Button
                                        onClick={handleGenerateBackgroundImage}
                                        disabled={generatingBackgroundIds.has(activeSlide.id)}
                                        className="flex-1 bg-purple-600 hover:bg-purple-500 text-xs"
                                    >
                                        {generatingBackgroundIds.has(activeSlide.id) ? (
                                            <>
                                                <Loader2 className="animate-spin h-4 w-4 mr-2" />
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <Zap className="h-4 w-4 mr-2" />
                                                AI Generate
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            {/* Overlay Color Picker */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Overlay Color</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={activeSlide.backgroundOverlayColor || (theme === 'DARK' ? '#000000' : '#FFFFFF')}
                                        onChange={(e) => {
                                            const newSlides = [...slides];
                                            newSlides[activeIndex] = { ...activeSlide, backgroundOverlayColor: e.target.value };
                                            onUpdateSlides(newSlides);
                                        }}
                                        className="w-8 h-8 rounded cursor-pointer border border-border"
                                    />
                                    <Button
                                        variant="link"
                                        size="sm"
                                        onClick={() => {
                                            const newSlides = [...slides];
                                            newSlides[activeIndex] = { ...activeSlide, backgroundOverlayColor: undefined };
                                            onUpdateSlides(newSlides);
                                        }}
                                        className="text-[10px] text-muted-foreground hover:text-foreground p-0 h-auto"
                                    >
                                        Reset
                                    </Button>
                                </div>
                            </div>

                            {/* Overlay Opacity Slider */}
                            <div>
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>Overlay Opacity</span>
                                    <span>{activeSlide.backgroundOverlayOpacity !== undefined ? activeSlide.backgroundOverlayOpacity : 50}%</span>
                                </div>
                                <Slider
                                    value={[activeSlide.backgroundOverlayOpacity !== undefined ? activeSlide.backgroundOverlayOpacity : 50]}
                                    min={0}
                                    max={100}
                                    step={1}
                                    onValueChange={(value) => {
                                        const newSlides = [...slides];
                                        newSlides[activeIndex] = { ...activeSlide, backgroundOverlayOpacity: value[0] };
                                        onUpdateSlides(newSlides);
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Image Toggle (Illustration Image) */}
                <div className="flex items-center justify-between mb-4">
                     <span className="font-semibold text-sm">Illustration Image</span>
                     <Switch
                        checked={activeSlide.showImage}
                        onCheckedChange={(checked) => handleToggleImage(checked)}
                     />
                </div>

                {activeSlide.showImage && (
                    <div className="bg-secondary/50 rounded-lg p-3 border border-border animate-fade-in mb-4">

                        {/* Overlay Toggle (Storyteller Only) */}
                        {style === CarouselStyle.STORYTELLER && (
                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                                <span className="text-xs text-muted-foreground">Top Fade / Overlay</span>
                                <Switch
                                    checked={activeSlide.overlayImage !== false}
                                    onCheckedChange={(checked) => handleToggleOverlay(checked)}
                                />
                            </div>
                        )}

                        {/* Content Layout (Twitter Only) */}
                        {style === CarouselStyle.TWITTER && (
                            <div className="mb-4 pb-4 border-b border-border">
                                <span className="text-xs text-muted-foreground block mb-2">Image Position</span>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            const newSlides = [...slides];
                                            newSlides[activeIndex] = { ...activeSlide, contentLayout: 'default' };
                                            onUpdateSlides(newSlides);
                                        }}
                                        className={cn(
                                            "flex-1 px-2 py-1.5 text-[10px] font-medium",
                                            (!activeSlide.contentLayout || activeSlide.contentLayout === 'default')
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-secondary text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        Below
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            const newSlides = [...slides];
                                            newSlides[activeIndex] = { ...activeSlide, contentLayout: 'image-after-title' };
                                            onUpdateSlides(newSlides);
                                        }}
                                        className={cn(
                                            "flex-1 px-2 py-1.5 text-[10px] font-medium",
                                            activeSlide.contentLayout === 'image-after-title'
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-secondary text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        After Title
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            const newSlides = [...slides];
                                            newSlides[activeIndex] = { ...activeSlide, contentLayout: 'image-first' };
                                            onUpdateSlides(newSlides);
                                        }}
                                        className={cn(
                                            "flex-1 px-2 py-1.5 text-[10px] font-medium",
                                            activeSlide.contentLayout === 'image-first'
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-secondary text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        Top
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Image Preview / Actions */}
                        {activeSlide.imageUrl ? (
                             <div className="relative aspect-square rounded-md overflow-hidden mb-3 border border-border">
                                <img src={activeSlide.imageUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                                {/* Action buttons container */}
                                <div className="absolute top-1 right-1 flex gap-1">
                                    {/* Edit with AI button */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleOpenEditModal}
                                        className="bg-black/50 hover:bg-primary text-white h-6 w-6"
                                        title="Edit with AI"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    {/* Delete button */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const newSlides = [...slides];
                                            newSlides[activeIndex] = { ...activeSlide, imageUrl: undefined };
                                            onUpdateSlides(newSlides);
                                        }}
                                        className="bg-black/50 hover:bg-destructive text-white h-6 w-6"
                                        title="Remove image"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                             </div>
                        ) : (
                             <div className="h-32 bg-secondary rounded-md border-2 border-dashed border-border flex items-center justify-center mb-3">
                                 <span className="text-muted-foreground text-xs">No Image Selected</span>
                             </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <Button
                                variant="secondary"
                                onClick={() => fileInputRef.current?.click()}
                                className="text-xs"
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                Upload File
                            </Button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileUpload}
                            />
                            <Button
                                onClick={handleGenerateImage}
                                disabled={generatingSlideIds.has(activeSlide.id)}
                                className="text-xs"
                            >
                                {generatingSlideIds.has(activeSlide.id) ? (
                                    <>
                                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        AI Generate
                                    </>
                                )}
                            </Button>
                        </div>

                         {/* Model & Aspect Ratio Selectors for Image */}
                         <div className="grid grid-cols-2 gap-2 mb-4">
                             <div>
                                 <Label className="text-xs text-muted-foreground block mb-1">AI Model</Label>
                                 <Select value={selectedImageModel} onValueChange={setSelectedImageModel}>
                                    <SelectTrigger className="text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={IMAGE_MODEL_PRO}>Pro (Best)</SelectItem>
                                        <SelectItem value={IMAGE_MODEL_FLASH}>Flash (Fast)</SelectItem>
                                    </SelectContent>
                                 </Select>
                            </div>
                            <div>
                                 <Label className="text-xs text-muted-foreground block mb-1">Image Ratio</Label>
                                 <Select value={imageAspectRatio} onValueChange={(value) => setImageAspectRatio(value as AspectRatio)}>
                                    <SelectTrigger className="text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="16/9">16:9 Landscape</SelectItem>
                                        <SelectItem value="1/1">1:1 Square</SelectItem>
                                        <SelectItem value="4/5">4:5 Portrait</SelectItem>
                                        <SelectItem value="9/16">9:16 Story</SelectItem>
                                    </SelectContent>
                                 </Select>
                            </div>
                        </div>

                         {/* Image Controls: Height & Offset & Gradient */}
                         {activeSlide.imageUrl && (
                             <div className="space-y-4 pt-2 border-t border-border">
                                {/* Image Height Slider */}
                                {(style === CarouselStyle.STORYTELLER || !activeSlide.overlayImage) && (
                                    <div>
                                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                            <span>Image Height</span>
                                            <span>{activeSlide.imageScale || 50}%</span>
                                        </div>
                                        <Slider
                                            value={[activeSlide.imageScale || 50]}
                                            min={10}
                                            max={90}
                                            step={1}
                                            onValueChange={(value) => handleImageScaleChange(value[0])}
                                        />
                                    </div>
                                )}

                                {/* Vertical Position Slider (Offset) */}
                                <div>
                                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                        <span>Vertical Position</span>
                                        <span>{activeSlide.imageOffsetY !== undefined ? activeSlide.imageOffsetY : 50}%</span>
                                    </div>
                                    <Slider
                                        value={[activeSlide.imageOffsetY !== undefined ? activeSlide.imageOffsetY : 50]}
                                        min={0}
                                        max={100}
                                        step={1}
                                        onValueChange={(value) => handleImageOffsetChange(value[0])}
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                        <span>Top</span>
                                        <span>Center</span>
                                        <span>Bottom</span>
                                    </div>
                                </div>

                                {/* Gradient Height Slider (Storyteller Overlay Only) */}
                                {style === CarouselStyle.STORYTELLER && activeSlide.overlayImage !== false && (
                                     <div>
                                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                            <span>Overlay Fade Height</span>
                                            <span>{activeSlide.gradientHeight !== undefined ? activeSlide.gradientHeight : 60}%</span>
                                        </div>
                                        <Slider
                                            value={[activeSlide.gradientHeight !== undefined ? activeSlide.gradientHeight : 60]}
                                            min={0}
                                            max={100}
                                            step={1}
                                            onValueChange={(value) => handleGradientHeightChange(value[0])}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mt-3">
                             <Label className="text-xs text-muted-foreground block mb-1">Prompt override</Label>
                             <Textarea
                                className="w-full h-16 text-xs resize-none"
                                placeholder="Describe image..."
                                value={activeSlide.imagePrompt || ''}
                                onChange={(e) => {
                                    const newSlides = [...slides];
                                    newSlides[activeIndex] = { ...activeSlide, imagePrompt: e.target.value };
                                    onUpdateSlides(newSlides);
                                }}
                             />
                        </div>
                    </div>
                )}

            </div>
        </div>

      </div>
    </div>
  );
};

export default Workspace;
