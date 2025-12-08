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
import { Slide, Profile, CarouselStyle, CarouselProject, SlideType, AspectRatio, Theme, FontStyle } from '../types';
import TwitterSlide from './TwitterSlide';
import StorytellerSlide from './StorytellerSlide';
import { generateSlideImage, stylizeImage, editImage, refineCarouselContent, getApiAspectRatio, IMAGE_MODEL_PRO, IMAGE_MODEL_FLASH, DEFAULT_IMAGE_STYLE, setApiKey, getApiKeyMasked, hasApiKey } from '../services/geminiService';

interface WorkspaceProps {
  slides: Slide[];
  profile: Profile;
  style: CarouselStyle;
  aspectRatio: AspectRatio;
  onUpdateSlides: (slides: Slide[]) => void;
  onBack: () => void;
}

// External libraries loaded via CDN in index.html
declare global {
  interface Window {
    htmlToImage: any;  // PNG export library
    JSZip: any;        // ZIP creation for batch export
    saveAs: any;       // File download helper
  }
}

const Workspace: React.FC<WorkspaceProps> = ({ slides, profile, style, aspectRatio, onUpdateSlides, onBack }) => {
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
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">

      {/* AI Image Edit Modal */}
      {showEditImageModal && activeSlide?.imageUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">Edit Image with AI</h3>

            {/* Current Image Preview */}
            <div className="w-full max-w-[200px] mx-auto mb-4 rounded-lg overflow-hidden border border-gray-600">
              <img
                src={activeSlide.imageUrl}
                alt="Current"
                className="w-full h-auto object-contain"
              />
            </div>

            {/* Edit Prompt */}
            <div className="space-y-3">
              <label className="text-sm text-gray-300 font-medium">
                Describe your edit
              </label>
              <textarea
                value={editImagePrompt}
                onChange={(e) => setEditImagePrompt(e.target.value)}
                placeholder="e.g., 'Make it nighttime', 'Add rain', 'Change the background to a beach'"
                className="w-full h-24 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                disabled={isEditingImage}
              />
              <button
                onClick={handleEditImage}
                disabled={isEditingImage || !editImagePrompt.trim()}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isEditingImage ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Editing...
                  </>
                ) : (
                  'Apply Edit'
                )}
              </button>
            </div>

            {/* Cancel */}
            <button
              onClick={handleCloseEditModal}
              disabled={isEditingImage}
              className="w-full mt-4 text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Image Upload Modal */}
      {showUploadModal && pendingUploadImage && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">Image Options</h3>

            {/* Preview */}
            <div className="w-full max-w-[200px] mx-auto mb-4 rounded-lg overflow-hidden border border-gray-600">
              <img
                src={pendingUploadImage.base64}
                alt="Preview"
                className="w-full h-auto object-contain"
              />
            </div>
            {/* Detected ratio info */}
            <p className="text-center text-gray-400 text-xs mb-4">
              Detected: {pendingUploadImage.width}x{pendingUploadImage.height} ({pendingUploadImage.detectedRatio})
            </p>

            {/* Options */}
            <div className="space-y-4">
              {/* Use As-Is Button */}
              <button
                onClick={handleUseImageAsIs}
                disabled={isStylizing}
                className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Use as-is
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-600"></div>
                <span className="text-gray-400 text-sm">or</span>
                <div className="flex-1 h-px bg-gray-600"></div>
              </div>

              {/* Stylize Section */}
              <div className="space-y-3">
                <label className="text-sm text-gray-300 font-medium">
                  Stylize with AI (Nano Banana)
                </label>
                <textarea
                  value={stylizePrompt}
                  onChange={(e) => setStylizePrompt(e.target.value)}
                  placeholder="e.g., 'Make it look like a watercolor painting' or 'Add neon cyberpunk aesthetic'"
                  className="w-full h-20 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                  disabled={isStylizing}
                />
                <button
                  onClick={handleStylizeImage}
                  disabled={isStylizing || !stylizePrompt.trim()}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isStylizing ? (
                    <>
                      <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Stylizing...
                    </>
                  ) : (
                    'Stylize with AI'
                  )}
                </button>
              </div>
            </div>

            {/* Cancel */}
            <button
              onClick={handleCancelUpload}
              disabled={isStylizing}
              className="w-full mt-4 text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sidebar: Slide List */}
      <div className="w-64 border-r border-gray-700 flex flex-col bg-gray-800 flex-shrink-0 z-20">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="font-bold text-lg">Slides</h2>
          <div className="flex items-center gap-2">
            {/* Batch Mode Toggle */}
            <button
              onClick={() => {
                setBatchMode(!batchMode);
                if (batchMode) {
                  setSelectedSlideIds(new Set());
                  setSlideGenerationStatus({});
                }
              }}
              disabled={batchGenerating}
              className={`p-1.5 rounded text-sm transition-colors ${
                batchMode
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-700 text-gray-400'
              } disabled:opacity-50`}
              title={batchMode ? 'Exit Batch Mode' : 'Batch Generate Images'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Add Slide Button */}
            <button
              onClick={handleAddSlide}
              className="p-1 hover:bg-gray-700 rounded text-blue-400 transition-colors"
              title="Add Slide"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-12H4" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Batch Mode Controls */}
          {batchMode && (
            <div className="p-2 bg-gray-700 rounded-lg mb-2 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {selectedSlideIds.size === slides.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs text-gray-400">
                  {selectedSlideIds.size} selected
                </span>
              </div>
              <button
                onClick={handleBatchGenerateImages}
                disabled={selectedSlideIds.size === 0 || batchGenerating}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors"
              >
                {batchGenerating ? 'Generating...' : `Generate ${selectedSlideIds.size} Images`}
              </button>
            </div>
          )}
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              onClick={() => !batchMode && setActiveSlideId(slide.id)}
              className={`p-3 rounded-lg cursor-pointer transition-all border ${
                activeSlideId === slide.id && !batchMode
                  ? 'bg-blue-600 border-blue-400'
                  : 'bg-gray-700 border-transparent hover:bg-gray-600'
              } ${batchMode ? 'cursor-default' : ''}`}
            >
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  {/* Checkbox for batch mode */}
                  {batchMode && (
                    <input
                      type="checkbox"
                      checked={selectedSlideIds.has(slide.id)}
                      onChange={() => toggleSlideSelection(slide.id)}
                      className="w-4 h-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
                    <span className="text-xs text-blue-400 animate-pulse">...</span>
                  )}

                  {!batchMode && (
                    <button
                      onClick={handleDeleteSlide}
                      className="text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm truncate opacity-90">{slide.content}</p>

              {/* Image indicator */}
              {slide.showImage && (
                <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {slide.imageUrl ? 'Has image' : 'Needs image'}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-700">
           <button onClick={onBack} className="text-gray-400 hover:text-white text-sm flex items-center">
             ← Back to Setup
           </button>
        </div>
      </div>

      {/* Main Area: Preview & Tools */}
      <div className="flex-1 flex flex-col relative bg-gray-900 min-w-0">
        
        {/* Toolbar */}
        <div className="h-16 border-b border-gray-700 bg-gray-800 px-6 flex items-center justify-between flex-shrink-0 z-20">
            <div className="flex items-center gap-6">
                 <div>
                    <h1 className="font-bold text-xl">Workspace</h1>
                    <span className="text-xs text-gray-400">
                        {aspectRatio === '1/1' ? 'Square 1:1' : 'Portrait 4:5'} (1080px)
                    </span>
                 </div>
                 
                 {/* Zoom Control */}
                 <div className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-400 uppercase font-bold">Zoom</span>
                    <input 
                        type="range" 
                        min="0.1" 
                        max="1.0" 
                        step="0.05"
                        value={zoomLevel} 
                        onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                        className="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                 </div>
            </div>
            <div className="flex space-x-3">
                 {/* Project Import (hidden file input) */}
                 <input
                   type="file"
                   ref={projectImportRef}
                   className="hidden"
                   accept=".json"
                   onChange={handleImportProject}
                 />
                 <button
                   className="px-4 py-2 rounded text-sm font-medium transition-colors border border-gray-600 text-gray-300 hover:bg-gray-700"
                   onClick={() => projectImportRef.current?.click()}
                   title="Import project from JSON"
                 >
                    Import
                 </button>
                 <button
                   className="px-4 py-2 rounded text-sm font-medium transition-colors border border-gray-600 text-gray-300 hover:bg-gray-700"
                   onClick={handleExportProject}
                   title="Export project as JSON"
                 >
                    Export
                 </button>
                 <div className="w-px bg-gray-600"></div>
                 <button
                   className={`px-4 py-2 rounded text-sm font-medium transition-colors border border-gray-600 text-gray-300 hover:bg-gray-700 ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                   onClick={handleDownloadSlide}
                   disabled={isDownloading}
                 >
                    {isDownloading ? '...' : 'Download Slide'}
                 </button>
                 <button
                   className={`px-4 py-2 rounded text-sm font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                   onClick={handleDownloadCarousel}
                   disabled={isDownloading}
                 >
                    {isDownloading ? 'Zipping...' : 'Download Carousel'}
                 </button>
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
            <div className="w-96 bg-gray-800 border-l border-gray-700 p-6 flex flex-col overflow-y-auto flex-shrink-0 z-20">
                
                {/* Global Settings Section */}
                <div className="mb-6 border-b border-gray-700 pb-6">
                    <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">Global Settings</h3>

                    {/* API Key Management */}
                    <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-300">Gemini API Key</label>
                        <button
                          onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {showApiKeyInput ? 'Cancel' : 'Change'}
                        </button>
                      </div>
                      {!showApiKeyInput ? (
                        <div className="text-xs text-gray-400 font-mono">
                          {apiKeyDisplay || 'Not set'}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="Enter your Gemini API key"
                            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={handleSaveApiKey}
                            disabled={!apiKeyInput.trim()}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors"
                          >
                            Save API Key
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Dark/Light Mode Toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium text-gray-300">Theme</label>
                        <div className="flex bg-gray-700 rounded-lg p-1">
                            <button
                                onClick={() => setTheme('LIGHT')}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${theme === 'LIGHT' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-white'}`}
                            >
                                Light
                            </button>
                            <button
                                onClick={() => setTheme('DARK')}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${theme === 'DARK' ? 'bg-black text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            >
                                Dark
                            </button>
                        </div>
                    </div>

                     {/* Accent Color Toggle & Picker */}
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-300">Use Accent Color</label>
                        <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                            <input 
                                type="checkbox" 
                                checked={showAccent}
                                onChange={(e) => setShowAccent(e.target.checked)}
                                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 right-5"
                                style={{ right: showAccent ? '0' : 'auto', left: showAccent ? 'auto' : '0' }} 
                            />
                            <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${showAccent ? 'bg-blue-600' : 'bg-gray-600'}`}></label>
                        </div>
                    </div>

                    {showAccent && (
                        <div className="flex items-center gap-3 mb-4 bg-gray-700 p-2 rounded-lg border border-gray-600">
                            <input 
                                type="color" 
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                                title="Pick a color"
                            />
                            <input 
                                type="text" 
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                className="flex-1 bg-transparent text-sm text-white font-mono outline-none uppercase"
                                maxLength={7}
                                placeholder="#RRGGBB"
                            />
                        </div>
                    )}

                    {/* Slide Numbers Toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium text-gray-300">Slide Numbers</label>
                        <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                            <input 
                                type="checkbox" 
                                checked={showSlideNumbers}
                                onChange={(e) => setShowSlideNumbers(e.target.checked)}
                                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 right-5"
                                style={{ right: showSlideNumbers ? '0' : 'auto', left: showSlideNumbers ? 'auto' : '0' }} 
                            />
                            <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${showSlideNumbers ? 'bg-blue-600' : 'bg-gray-600'}`}></label>
                        </div>
                    </div>

                    {/* Verified Badge Toggle */}
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium text-gray-300">Verified Badge</label>
                        <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                            <input 
                                type="checkbox" 
                                checked={showVerifiedBadge}
                                onChange={(e) => setShowVerifiedBadge(e.target.checked)}
                                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 right-5"
                                style={{ right: showVerifiedBadge ? '0' : 'auto', left: showVerifiedBadge ? 'auto' : '0' }} 
                            />
                            <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${showVerifiedBadge ? 'bg-blue-600' : 'bg-gray-600'}`}></label>
                        </div>
                    </div>

                    {/* Header Scale Slider */}
                    <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Header/Footer Size</span>
                            <span>{Math.round(headerScale * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={headerScale}
                            onChange={(e) => setHeaderScale(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>

                    {/* Font Style Selector */}
                    <div className="mb-4">
                        <label className="text-sm font-medium text-gray-300 mb-2 block">Font Style</label>
                        <div className="flex bg-gray-700 rounded-lg p-1">
                            <button
                                onClick={() => setFontStyle('MODERN')}
                                className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold transition-all ${fontStyle === 'MODERN' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            >
                                Modern
                            </button>
                            <button
                                onClick={() => setFontStyle('SERIF')}
                                className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold transition-all ${fontStyle === 'SERIF' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                style={{ fontFamily: '"Playfair Display", serif' }}
                            >
                                Serif
                            </button>
                            <button
                                onClick={() => setFontStyle('TECH')}
                                className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold transition-all ${fontStyle === 'TECH' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                style={{ fontFamily: '"JetBrains Mono", monospace' }}
                            >
                                Tech
                            </button>
                        </div>
                    </div>

                    {/* Font Size Slider */}
                    <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Font Size</span>
                            <span>{Math.round(fontScale * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="1.5"
                            step="0.05"
                            value={fontScale}
                            onChange={(e) => setFontScale(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>

                    {/* Global Image Style */}
                    <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-300">Image Generation Style</label>
                            <button
                                onClick={() => setGlobalImageStyle(DEFAULT_IMAGE_STYLE)}
                                className="text-xs text-gray-500 hover:text-gray-300"
                                title="Reset to default"
                            >
                                Reset
                            </button>
                        </div>
                        <textarea
                            value={globalImageStyle}
                            onChange={(e) => setGlobalImageStyle(e.target.value)}
                            placeholder="Style prefix for all AI-generated images..."
                            className="w-full h-16 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white resize-none focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Applied to all AI-generated images</p>
                    </div>

                    {/* AI Content Refinement (Global) */}
                    <div className="p-3 bg-gray-700 rounded-lg">
                        <label className="text-sm font-medium text-gray-300 mb-2 block">
                            Refine All Slides with AI
                        </label>
                        <textarea
                            value={globalFeedback}
                            onChange={(e) => setGlobalFeedback(e.target.value)}
                            placeholder="E.g., 'Translate to Spanish', 'Make more technical', 'Make it more fun'"
                            className="w-full h-16 bg-gray-800 border border-gray-600 rounded p-2 text-sm text-white resize-none focus:ring-1 focus:ring-blue-500 outline-none mb-2"
                            disabled={isRefining}
                        />
                        <button
                            onClick={handleGlobalRefine}
                            disabled={!globalFeedback.trim() || isRefining}
                            className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors flex items-center justify-center"
                        >
                            {isRefining ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Refining...
                                </>
                            ) : (
                                'Refine All Slides'
                            )}
                        </button>
                    </div>
                </div>

                <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Edit Slide</h3>
                
                {/* Rich Text Toolbar */}
                <div className="flex space-x-1 mb-2 bg-gray-700 p-1 rounded-md">
                    <button onClick={() => insertMarkdown('**', '**')} className="p-1.5 hover:bg-gray-600 rounded text-gray-300 font-bold text-xs" title="Bold">B</button>
                    <button onClick={() => insertMarkdown('*', '*')} className="p-1.5 hover:bg-gray-600 rounded text-gray-300 italic text-xs" title="Italic">I</button>
                    <button onClick={() => insertMarkdown('__', '__')} className="p-1.5 hover:bg-gray-600 rounded text-gray-300 underline text-xs" title="Underline">U</button>
                    <button onClick={() => insertMarkdown('~~', '~~')} className="p-1.5 hover:bg-gray-600 rounded text-gray-300 line-through text-xs" title="Strike">S</button>
                    <div className="w-px bg-gray-600 mx-1"></div>
                    <button onClick={() => insertMarkdown('# ')} className="p-1.5 hover:bg-gray-600 rounded text-gray-300 font-bold text-xs" title="Heading 1">H1</button>
                    <button onClick={() => insertMarkdown('## ')} className="p-1.5 hover:bg-gray-600 rounded text-gray-300 font-bold text-xs" title="Heading 2">H2</button>
                    <div className="w-px bg-gray-600 mx-1"></div>
                    <button onClick={() => insertMarkdown('- ')} className="p-1.5 hover:bg-gray-600 rounded text-gray-300 text-xs" title="Bullet List">• List</button>
                </div>

                <textarea
                    ref={textAreaRef}
                    className="w-full min-h-[8rem] bg-gray-700 border border-gray-600 rounded p-3 text-white text-sm mb-3 focus:ring-2 focus:ring-blue-500 outline-none resize-y font-mono"
                    value={activeSlide.content}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Enter text (Markdown supported)..."
                />

                {/* Per-Slide AI Refinement */}
                <div className="mb-4 flex gap-2">
                    <input
                        type="text"
                        value={slideFeedback}
                        onChange={(e) => setSlideFeedback(e.target.value)}
                        placeholder="Refine this slide... (e.g., 'make it shorter')"
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-purple-500"
                        disabled={isRefining}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSlideRefine();
                            }
                        }}
                    />
                    <button
                        onClick={handleSlideRefine}
                        disabled={!slideFeedback.trim() || isRefining}
                        className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors flex items-center"
                        title="Refine this slide"
                    >
                        {isRefining ? (
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Per-Slide Font Override */}
                <div className="mb-4 p-3 bg-gray-750 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">Slide Font Override</span>
                        <button
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = {
                                    ...activeSlide,
                                    fontStyle: undefined,
                                    fontScale: undefined
                                };
                                onUpdateSlides(newSlides);
                            }}
                            className="text-xs text-gray-500 hover:text-gray-300"
                            title="Reset to global settings"
                        >
                            Reset
                        </button>
                    </div>

                    {/* Per-Slide Font Style */}
                    <div className="flex bg-gray-700 rounded-lg p-1 mb-2">
                        <button
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontStyle: undefined };
                                onUpdateSlides(newSlides);
                            }}
                            className={`flex-1 px-1 py-1 rounded text-[10px] font-bold transition-all ${!activeSlide.fontStyle ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-white'}`}
                        >
                            Global
                        </button>
                        <button
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontStyle: 'MODERN' };
                                onUpdateSlides(newSlides);
                            }}
                            className={`flex-1 px-1 py-1 rounded text-[10px] font-bold transition-all ${activeSlide.fontStyle === 'MODERN' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}
                        >
                            Modern
                        </button>
                        <button
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontStyle: 'SERIF' };
                                onUpdateSlides(newSlides);
                            }}
                            className={`flex-1 px-1 py-1 rounded text-[10px] font-bold transition-all ${activeSlide.fontStyle === 'SERIF' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}
                            style={{ fontFamily: '"Playfair Display", serif' }}
                        >
                            Serif
                        </button>
                        <button
                            onClick={() => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontStyle: 'TECH' };
                                onUpdateSlides(newSlides);
                            }}
                            className={`flex-1 px-1 py-1 rounded text-[10px] font-bold transition-all ${activeSlide.fontStyle === 'TECH' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}
                            style={{ fontFamily: '"JetBrains Mono", monospace' }}
                        >
                            Tech
                        </button>
                    </div>

                    {/* Per-Slide Font Size */}
                    <div>
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                            <span>Size</span>
                            <span>{activeSlide.fontScale !== undefined ? `${Math.round(activeSlide.fontScale * 100)}%` : 'Global'}</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="1.5"
                            step="0.05"
                            value={activeSlide.fontScale !== undefined ? activeSlide.fontScale : fontScale}
                            onChange={(e) => {
                                const newSlides = [...slides];
                                newSlides[activeIndex] = { ...activeSlide, fontScale: parseFloat(e.target.value) };
                                onUpdateSlides(newSlides);
                            }}
                            className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                </div>

                {/* Image Toggle */}
                <div className="flex items-center justify-between mb-4">
                     <span className="font-semibold text-sm">Image</span>
                     <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                        <input 
                            type="checkbox" 
                            checked={activeSlide.showImage}
                            onChange={(e) => handleToggleImage(e.target.checked)}
                            className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 right-5"
                            style={{ right: activeSlide.showImage ? '0' : 'auto', left: activeSlide.showImage ? 'auto' : '0' }} 
                        />
                        <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${activeSlide.showImage ? 'bg-blue-600' : 'bg-gray-600'}`}></label>
                    </div>
                </div>

                {activeSlide.showImage && (
                    <div className="bg-gray-750 rounded-lg p-3 border border-gray-700 animate-fade-in mb-4">
                        
                        {/* Overlay Toggle (Storyteller Only) */}
                        {style === CarouselStyle.STORYTELLER && (
                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-700">
                                <span className="text-xs text-gray-400">Top Fade / Overlay</span>
                                <div className="relative inline-block w-8 mr-1 align-middle select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={activeSlide.overlayImage !== false}
                                        onChange={(e) => handleToggleOverlay(e.target.checked)}
                                        className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-2 appearance-none cursor-pointer checked:right-0 right-4"
                                        style={{ right: activeSlide.overlayImage !== false ? '0' : 'auto', left: activeSlide.overlayImage !== false ? 'auto' : '0' }} 
                                    />
                                    <label className={`toggle-label block overflow-hidden h-4 rounded-full cursor-pointer ${activeSlide.overlayImage !== false ? 'bg-purple-600' : 'bg-gray-600'}`}></label>
                                </div>
                            </div>
                        )}

                        {/* Image Preview / Actions */}
                        {activeSlide.imageUrl ? (
                             <div className="relative aspect-square rounded-md overflow-hidden mb-3 border border-gray-600">
                                <img src={activeSlide.imageUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                                {/* Action buttons container */}
                                <div className="absolute top-1 right-1 flex gap-1">
                                    {/* Edit with AI button */}
                                    <button
                                        onClick={handleOpenEditModal}
                                        className="bg-black bg-opacity-50 hover:bg-blue-500 text-white p-1 rounded-full transition-colors"
                                        title="Edit with AI"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>
                                    {/* Delete button */}
                                    <button
                                        onClick={() => {
                                            const newSlides = [...slides];
                                            newSlides[activeIndex] = { ...activeSlide, imageUrl: undefined };
                                            onUpdateSlides(newSlides);
                                        }}
                                        className="bg-black bg-opacity-50 hover:bg-red-500 text-white p-1 rounded-full transition-colors"
                                        title="Remove image"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                             </div>
                        ) : (
                             <div className="h-32 bg-gray-800 rounded-md border-2 border-dashed border-gray-600 flex items-center justify-center mb-3">
                                 <span className="text-gray-500 text-xs">No Image Selected</span>
                             </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-gray-600 hover:bg-gray-500 text-white py-2 rounded text-xs font-semibold transition-colors"
                            >
                                Upload File
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleFileUpload}
                            />
                            <button
                                onClick={handleGenerateImage}
                                disabled={generatingSlideIds.has(activeSlide.id)}
                                className={`bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-xs font-semibold transition-colors flex items-center justify-center ${generatingSlideIds.has(activeSlide.id) ? 'opacity-70 cursor-wait' : ''}`}
                            >
                                {generatingSlideIds.has(activeSlide.id) ? 'Generating...' : 'AI Generate'}
                            </button>
                        </div>
                        
                         {/* Model & Aspect Ratio Selectors for Image */}
                         <div className="grid grid-cols-2 gap-2 mb-4">
                             <div>
                                 <label className="text-xs text-gray-400 block mb-1">AI Model</label>
                                 <div className="relative">
                                    <select
                                        value={selectedImageModel}
                                        onChange={(e) => setSelectedImageModel(e.target.value)}
                                        className="w-full appearance-none bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded p-2 pr-6 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer hover:border-gray-500 transition-colors"
                                    >
                                        <option value={IMAGE_MODEL_PRO}>Pro (Best)</option>
                                        <option value={IMAGE_MODEL_FLASH}>Flash (Fast)</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-1 pointer-events-none text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div>
                                 <label className="text-xs text-gray-400 block mb-1">Image Ratio</label>
                                 <div className="relative">
                                    <select
                                        value={imageAspectRatio}
                                        onChange={(e) => setImageAspectRatio(e.target.value as AspectRatio)}
                                        className="w-full appearance-none bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded p-2 pr-6 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer hover:border-gray-500 transition-colors"
                                    >
                                        <option value="16/9">16:9 Landscape</option>
                                        <option value="1/1">1:1 Square</option>
                                        <option value="4/5">4:5 Portrait</option>
                                        <option value="9/16">9:16 Story</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-1 pointer-events-none text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                         {/* Image Controls: Height & Offset & Gradient */}
                         {activeSlide.imageUrl && (
                             <div className="space-y-4 pt-2 border-t border-gray-700">
                                {/* Image Height Slider */}
                                {(style === CarouselStyle.STORYTELLER || !activeSlide.overlayImage) && (
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                                            <span>Image Height</span>
                                            <span>{activeSlide.imageScale || 50}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="10" 
                                            max="90" 
                                            value={activeSlide.imageScale || 50} 
                                            onChange={(e) => handleImageScaleChange(parseInt(e.target.value))}
                                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                )}

                                {/* Vertical Position Slider (Offset) */}
                                <div>
                                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                                        <span>Vertical Position</span>
                                        <span>{activeSlide.imageOffsetY !== undefined ? activeSlide.imageOffsetY : 50}%</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        value={activeSlide.imageOffsetY !== undefined ? activeSlide.imageOffsetY : 50} 
                                        onChange={(e) => handleImageOffsetChange(parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                        <span>Top</span>
                                        <span>Center</span>
                                        <span>Bottom</span>
                                    </div>
                                </div>

                                {/* Gradient Height Slider (Storyteller Overlay Only) */}
                                {style === CarouselStyle.STORYTELLER && activeSlide.overlayImage !== false && (
                                     <div>
                                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                                            <span>Overlay Fade Height</span>
                                            <span>{activeSlide.gradientHeight !== undefined ? activeSlide.gradientHeight : 60}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="100" 
                                            value={activeSlide.gradientHeight !== undefined ? activeSlide.gradientHeight : 60} 
                                            onChange={(e) => handleGradientHeightChange(parseInt(e.target.value))}
                                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mt-3">
                             <label className="text-xs text-gray-400 block mb-1">Prompt override</label>
                             <textarea 
                                className="w-full h-16 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white outline-none resize-none"
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
