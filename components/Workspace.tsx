
import React, { useState, useRef, useEffect } from 'react';
import { Slide, Profile, CarouselStyle, SlideType, AspectRatio, Theme } from '../types';
import TwitterSlide from './TwitterSlide';
import StorytellerSlide from './StorytellerSlide';
import { generateSlideImage, stylizeImage, IMAGE_MODEL_PRO, IMAGE_MODEL_FLASH, setApiKey, getApiKeyMasked, hasApiKey } from '../services/geminiService';

interface WorkspaceProps {
  slides: Slide[];
  profile: Profile;
  style: CarouselStyle;
  aspectRatio: AspectRatio;
  onUpdateSlides: (slides: Slide[]) => void;
  onBack: () => void;
}

// Declare global types for external libraries
declare global {
  interface Window {
    htmlToImage: any;
    JSZip: any;
    saveAs: any;
  }
}

const Workspace: React.FC<WorkspaceProps> = ({ slides, profile, style, aspectRatio, onUpdateSlides, onBack }) => {
  const [activeSlideId, setActiveSlideId] = useState<string>(slides[0].id);
  const [generatingSlideIds, setGeneratingSlideIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  // Keep a ref to the latest slides to avoid stale closure issues in async handlers
  const slidesRef = useRef(slides);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  
  // Global Settings
  const [showSlideNumbers, setShowSlideNumbers] = useState(true);
  const [showVerifiedBadge, setShowVerifiedBadge] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(0.4); 
  const [headerScale, setHeaderScale] = useState(1.0);
  const [accentColor, setAccentColor] = useState('#EAB308'); // Default Yellow-500
  const [showAccent, setShowAccent] = useState(true);

  const [selectedImageModel, setSelectedImageModel] = useState<string>(IMAGE_MODEL_PRO);
  const [imageAspectRatio, setImageAspectRatio] = useState<AspectRatio>('16/9'); // Default 16:9 for image generation

  // Set default theme based on style: Storyteller -> Dark, Twitter -> Light
  const [theme, setTheme] = useState<Theme>(
    style === CarouselStyle.STORYTELLER ? 'DARK' : 'LIGHT'
  );

  // Image Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingUploadImage, setPendingUploadImage] = useState<{
    base64: string;
    rawBase64: string;
    mimeType: string;
    width: number;
    height: number;
    detectedRatio: string;  // Closest API-supported ratio (e.g., "1:1", "9:16")
  } | null>(null);
  const [stylizePrompt, setStylizePrompt] = useState('');
  const [isStylizing, setIsStylizing] = useState(false);

  // Helper to find closest API-supported aspect ratio
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

  // Batch Generation State
  const [batchMode, setBatchMode] = useState(false);
  const [selectedSlideIds, setSelectedSlideIds] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [slideGenerationStatus, setSlideGenerationStatus] = useState<Record<string, 'idle' | 'generating' | 'success' | 'error'>>({});

  // API Key Management
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

  const handleGenerateImage = async () => {
    if (!activeSlide) return;

    // Capture slide ID and prompt at call time (not the whole slide object)
    const slideId = activeSlide.id;
    const prompt = activeSlide.imagePrompt || `An abstract representation of: ${activeSlide.content.substring(0, 50)}`;

    // Add this slide to generating set (allows concurrent generation)
    setGeneratingSlideIds(prev => new Set(prev).add(slideId));

    try {
      const base64Image = await generateSlideImage(prompt, imageAspectRatio, selectedImageModel);

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

  // --- Batch Generation Logic ---

  const handleBatchGenerateImages = async () => {
    if (selectedSlideIds.size === 0) return;

    setBatchGenerating(true);

    // Initialize all selected slides as "generating"
    const initialStatus: Record<string, 'idle' | 'generating' | 'success' | 'error'> = {};
    selectedSlideIds.forEach(id => {
      initialStatus[id] = 'generating';
    });
    setSlideGenerationStatus(initialStatus);

    // Create array of generation promises
    const generationPromises = Array.from(selectedSlideIds).map(async (slideId) => {
      const slideIndex = slides.findIndex(s => s.id === slideId);
      if (slideIndex === -1) return { slideId, success: false };

      const slide = slides[slideIndex];
      const prompt = slide.imagePrompt ||
        `An abstract representation of: ${slide.content.substring(0, 50)}`;

      try {
        const base64Image = await generateSlideImage(prompt, imageAspectRatio, selectedImageModel);
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

  // --- Download Logic ---

  const captureSlide = async (elementId: string): Promise<Blob | null> => {
      const element = document.getElementById(elementId);
      if (!element) return null;

      // Determine bg color based on mode and style
      const bgColor = theme === 'DARK' ? '#0a0a0a' : '#FFFFFF';

      // Store original styles
      const originalElementStyle = element.getAttribute('style') || '';
      const slideChild = element.firstElementChild as HTMLElement;
      const originalSlideChildStyle = slideChild?.getAttribute('style') || '';

      try {
          // Move THIS specific element to fixed position on-screen
          // This ensures the browser fully paints it regardless of its position in the hidden container
          element.style.cssText = `
              position: fixed;
              top: 0;
              left: 0;
              z-index: 9999;
              visibility: visible;
              width: ${PREVIEW_WIDTH}px;
              height: ${previewHeight}px;
              background-color: ${bgColor};
          `;

          // Force background color on the slide child component with inline style
          if (slideChild) {
              slideChild.style.cssText = `${originalSlideChildStyle}; background-color: ${bgColor} !important; width: 100%; height: 100%;`;
          }

          // Force a reflow to ensure styles are applied
          void element.offsetHeight;

          // Wait for browser to render
          await new Promise(resolve => setTimeout(resolve, 100));

          // Use html-to-image which captures actual rendered pixels via SVG foreignObject
          const dataUrl = await window.htmlToImage.toPng(element, {
              width: PREVIEW_WIDTH,
              height: previewHeight,
              backgroundColor: bgColor,
              pixelRatio: 1,
              skipFonts: false,
              cacheBust: true
          });

          // Restore original styles
          element.setAttribute('style', originalElementStyle);
          if (slideChild) {
              slideChild.setAttribute('style', originalSlideChildStyle);
          }

          // Convert data URL to blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          return blob;
      } catch (err) {
          console.error("Capture failed:", err);
          // Restore styles even on error
          element.setAttribute('style', originalElementStyle);
          if (slideChild) {
              slideChild.setAttribute('style', originalSlideChildStyle);
          }
          return null;
      }
  };

  const handleDownloadSlide = async () => {
      if (isDownloading) return;
      setIsDownloading(true);
      
      const exportId = `export-slide-${activeSlideId}`;
      const blob = await captureSlide(exportId);
      
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
      let count = 0;

      for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          const exportId = `export-slide-${slide.id}`;
          const blob = await captureSlide(exportId);
          if (blob) {
              zip.file(`slide-${i + 1}.png`, blob);
              count++;
          }
      }

      if (count > 0) {
          const content = await zip.generateAsync({ type: "blob" });
          window.saveAs(content, "instagram-carousel.zip");
      } else {
          alert("Failed to generate carousel images.");
      }
      
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
        forExport: isExport
      };

      if (style === CarouselStyle.STORYTELLER) {
          return <StorytellerSlide {...commonProps} />;
      }
      return <TwitterSlide {...commonProps} />;
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">

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

      {/* HIDDEN RENDER AREA FOR EXPORT - Each slide in its own absolute container */}
      {slides.map((slide, idx) => (
          <div
              key={`export-wrapper-${slide.id}`}
              style={{ position: 'absolute', top: 0, left: '-9999px', visibility: 'hidden' }}
          >
              <div
                  id={`export-slide-${slide.id}`}
                  style={{
                      width: `${PREVIEW_WIDTH}px`,
                      height: `${previewHeight}px`,
                      backgroundColor: theme === 'DARK' ? '#0a0a0a' : '#FFFFFF'
                  }}
              >
                 {renderSlide(slide, idx, true)}
              </div>
          </div>
      ))}


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
                    <div>
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
                    className="w-full min-h-[8rem] bg-gray-700 border border-gray-600 rounded p-3 text-white text-sm mb-6 focus:ring-2 focus:ring-blue-500 outline-none resize-y font-mono"
                    value={activeSlide.content}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Enter text (Markdown supported)..."
                />

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
                                <button 
                                    onClick={() => {
                                        const newSlides = [...slides];
                                        newSlides[activeIndex] = { ...activeSlide, imageUrl: undefined };
                                        onUpdateSlides(newSlides);
                                    }}
                                    className="absolute top-1 right-1 bg-black bg-opacity-50 hover:bg-red-500 text-white p-1 rounded-full transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
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
