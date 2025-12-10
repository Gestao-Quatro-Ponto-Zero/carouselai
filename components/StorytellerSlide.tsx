/**
 * StorytellerSlide Component
 *
 * Renders slides in a cinematic, image-first aesthetic. Designed for
 * visually engaging stories with bold typography over background images.
 *
 * TWO LAYOUT MODES:
 * 1. OVERLAY (default): Image as background with gradient fade, text floats over
 * 2. SPLIT: Hard line between image (top) and text (bottom)
 *
 * The mode is controlled by the slide.overlayImage property:
 * - undefined or true → Overlay mode (cinematic fade)
 * - false → Split mode (clean division)
 */

import React from 'react';
import { Slide, Profile, Theme, FontStyle, LayoutSettings, TextAlignment } from '../types';

interface StorytellerSlideProps {
  slide: Slide;
  profile: Profile;
  index: number;
  total: number;
  showSlideNumbers: boolean;
  headerScale?: number;      // Size multiplier for footer elements (0.5 - 2.0)
  theme: Theme;
  forExport?: boolean;       // True when rendering for PNG capture
  showVerifiedBadge?: boolean;
  accentColor?: string;      // Highlight color for __underlined__ text and bullets
  fontStyle?: FontStyle;     // Global font style (can be overridden by slide)
  fontScale?: number;        // Global font scale (can be overridden by slide)
  layoutSettings?: LayoutSettings; // Global layout settings (can be overridden by slide)
}

// ============================================================================
// FONT CONFIGURATION
// ============================================================================

/**
 * Maps FontStyle to CSS font-family values.
 * Uses Google Fonts loaded via CDN in index.html
 */
const getFontFamily = (style: FontStyle): string => {
  switch (style) {
    case 'SERIF':
      return '"Playfair Display", Georgia, serif';
    case 'TECH':
      return '"JetBrains Mono", "Fira Code", monospace';
    case 'MODERN':
    default:
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }
};

// ============================================================================
// MARKDOWN PARSER
// ============================================================================

/**
 * Parses inline markdown syntax and returns React elements.
 *
 * SUPPORTED SYNTAX:
 * - **bold** → Strong, high contrast
 * - *italic* → Emphasized, muted
 * - ~~strikethrough~~ → Crossed out, dimmed
 * - __highlighted__ → Background highlight using accent color
 *
 * ACCENT COLOR HIGHLIGHTING:
 * When accentColor is provided (e.g., "#EAB308"), highlighted text gets
 * a semi-transparent background: `#EAB3084D` (4D = ~30% opacity in hex)
 */
const parseInline = (text: string, theme: Theme, accentColor?: string) => {
  const boldColor = theme === 'DARK' ? 'text-white' : 'text-black';
  const italicColor = theme === 'DARK' ? 'text-gray-300' : 'text-gray-600';

  // Hex alpha: 4D ≈ 30% opacity (77/255)
  const highlightStyle = accentColor
    ? { backgroundColor: `${accentColor}4D` }
    : { backgroundColor: theme === 'DARK' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' };

  // Regex splits text while keeping markdown tokens as separate parts
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|~~.*?~~|__.*?__)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className={`font-black ${boldColor}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className={`italic ${italicColor}`}>{part.slice(1, -1)}</em>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={i} className="opacity-70">{part.slice(2, -2)}</s>;
    if (part.startsWith('__') && part.endsWith('__')) return <span key={i} style={highlightStyle} className="px-1 rounded font-semibold">{part.slice(2, -2)}</span>;
    return part;
  });
};

const renderMarkdown = (
  text: string,
  theme: Theme,
  accentColor?: string,
  fontScale: number = 1.0,
  lineHeight: number = 1.5,
  paragraphGap: number = 1,
  textColorOverride?: string,
  textAlignment: TextAlignment = 'left'
) => {
  const lines = text.split('\n');
  const textColor = textColorOverride || (theme === 'DARK' ? '#F3F4F6' : '#111827');
  const headingColor = textColorOverride || (theme === 'DARK' ? '#FFFFFF' : '#000000');

  // Use accent color for bullets/numbers if provided. Otherwise generic color.
  const bulletStyle = accentColor
    ? { color: accentColor }
    : { color: textColorOverride || (theme === 'DARK' ? '#cbd5e1' : '#475569') };

  // Base font sizes in pixels (for 1080px width), then multiplied by fontScale
  const h1Size = 72 * fontScale;
  const h2Size = 48 * fontScale;
  const bodySize = 36 * fontScale;

  // Paragraph spacing in pixels (rem * 16px base)
  const paragraphSpacing = paragraphGap * 16;

  // List alignment classes based on textAlignment
  const listJustify = textAlignment === 'center' ? 'justify-center' : textAlignment === 'right' ? 'justify-end' : '';

  return lines.map((line, idx) => {
    const trimmed = line.trim();

    // Huge Headers
    if (line.startsWith('# ')) {
      return <h1 key={idx} className="font-black tracking-tighter uppercase drop-shadow-sm" style={{ fontSize: `${h1Size}px`, lineHeight: lineHeight, marginBottom: `${paragraphSpacing}px`, color: headingColor, textAlign: textAlignment }}>{parseInline(line.slice(2), theme, accentColor)}</h1>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={idx} className="font-extrabold tracking-tight" style={{ fontSize: `${h2Size}px`, lineHeight: lineHeight, marginBottom: `${paragraphSpacing * 0.75}px`, color: headingColor, textAlign: textAlignment }}>{parseInline(line.slice(3), theme, accentColor)}</h2>;
    }

    // Lists with accent color
    if (trimmed.startsWith('- ')) {
       return (
         <div key={idx} className={`flex items-start ${textAlignment === 'left' ? 'ml-2' : ''} ${listJustify}`} style={{ marginBottom: `${paragraphSpacing * 0.5}px` }}>
            <span className="mr-4 mt-1" style={{ ...bulletStyle, fontSize: `${bodySize}px` }}>●</span>
            <span className="font-medium" style={{ fontSize: `${bodySize}px`, lineHeight: lineHeight, color: textColor }}>{parseInline(line.slice(2), theme, accentColor)}</span>
         </div>
       );
    }
    if (/^\d+\. /.test(trimmed)) {
        const number = trimmed.match(/^\d+/)?.[0];
        const content = trimmed.replace(/^\d+\. /, '');
        return (
            <div key={idx} className={`flex items-start ${textAlignment === 'left' ? 'ml-2' : ''} ${listJustify}`} style={{ marginBottom: `${paragraphSpacing * 0.5}px` }}>
               <span className="mr-4 font-black" style={{ ...bulletStyle, fontSize: `${bodySize}px` }}>{number}.</span>
               <span className="font-medium" style={{ fontSize: `${bodySize}px`, lineHeight: lineHeight, color: textColor }}>{parseInline(content, theme, accentColor)}</span>
            </div>
          );
    }

    // Empty lines
    if (!trimmed) return <div key={idx} style={{ height: `${paragraphSpacing * 0.5}px` }}></div>;

    // Body Text
    return <p key={idx} className="font-medium" style={{ fontSize: `${bodySize}px`, lineHeight: lineHeight, marginBottom: `${paragraphSpacing}px`, color: textColor, textAlign: textAlignment }}>{parseInline(line, theme, accentColor)}</p>;
  });
};

const StorytellerSlide: React.FC<StorytellerSlideProps> = ({ slide, profile, index, total, showSlideNumbers, headerScale = 1.0, theme, forExport = false, showVerifiedBadge = true, accentColor, fontStyle = 'MODERN', fontScale = 1.0, layoutSettings }) => {

  // ============================================================================
  // DEFAULT LAYOUT SETTINGS
  // ============================================================================
  const defaultLayoutSettings: LayoutSettings = {
    contentPadding: 64,
    imageCanvasOffset: 0,
    imageMargin: 0,
    textLineHeight: 1.5,
    paragraphGap: 1,
  };

  // EFFECTIVE LAYOUT VALUES (per-slide override > global > default)
  const effectiveContentPadding = slide.contentPadding ?? layoutSettings?.contentPadding ?? defaultLayoutSettings.contentPadding;
  const effectiveLineHeight = slide.textLineHeight ?? layoutSettings?.textLineHeight ?? defaultLayoutSettings.textLineHeight;
  const effectiveParagraphGap = slide.paragraphGap ?? layoutSettings?.paragraphGap ?? defaultLayoutSettings.paragraphGap;
  const effectiveTextAlignment = slide.textAlignment ?? layoutSettings?.textAlignment ?? 'left';

  // ============================================================================
  // LAYOUT MODE DETERMINATION
  // ============================================================================

  // OVERLAY MODE: Image behind text with gradient fade (cinematic look)
  // SPLIT MODE: Image on top, text below with hard dividing line
  const isOverlay = slide.showImage && (slide.overlayImage !== false);
  const showSplit = slide.showImage && !isOverlay;

  // Image sizing and positioning
  const imageScale = slide.imageScale || 45;  // Default 45% (smaller than Twitter's 50%)
  const imageOffsetY = slide.imageOffsetY !== undefined ? slide.imageOffsetY : 50; // Vertical crop position
  const gradientHeight = slide.gradientHeight !== undefined ? slide.gradientHeight : 60; // Fade overlay size

  // ============================================================================
  // BACKGROUND IMAGE SETTINGS (separate from illustration image)
  // ============================================================================
  const showBackground = slide.showBackgroundImage && slide.backgroundImageUrl;
  const bgOverlayColor = slide.backgroundOverlayColor || (theme === 'DARK' ? '#000000' : '#FFFFFF');
  const bgOverlayOpacity = slide.backgroundOverlayOpacity !== undefined ? slide.backgroundOverlayOpacity : 50;
  const bgTextColor = slide.backgroundTextColor; // Custom text color for background image mode

  // Text color override when background image is set
  const textColorOverride = showBackground && bgTextColor ? bgTextColor : undefined;

  // FONT SETTINGS:
  // Per-slide settings override global settings
  const effectiveFontStyle = slide.fontStyle || fontStyle;
  const effectiveFontScale = slide.fontScale !== undefined ? slide.fontScale : fontScale;
  const fontFamily = getFontFamily(effectiveFontStyle);

  // Calculate layout percentages based on mode
  const splitTextHeight = 100 - imageScale;   // Split mode: remaining space for text
  const splitImageHeight = imageScale;         // Split mode: image takes imageScale%
  const overlayImageHeight = imageScale;       // Overlay mode: image covers imageScale% from top

  // TEXT PADDING CALCULATION (overlay mode only):
  // We want text to start where the gradient begins, creating a seamless transition.
  // The -12 offset pushes text up slightly into the gradient zone for visual overlap.
  const overlayTextPaddingTop = Math.max(0, overlayImageHeight - 12);

  const bgColor = theme === 'DARK' ? '#0a0a0a' : '#ffffff';
  
  const avatarSize = 64 * headerScale;
  const nameSize = 32 * headerScale;
  const verifiedSize = 28 * headerScale;
  const marginBottom = 60 * headerScale;

  return (
    <div
      className={`w-full h-full flex flex-col relative overflow-hidden ${forExport ? '' : 'transition-colors duration-300'}`}
      style={{ backgroundColor: bgColor, fontFamily }}
    >

      {/* ================================================================
          BACKGROUND IMAGE LAYER (z-0)
          Full-bleed background with solid color overlay.
          This is SEPARATE from the illustration image (overlay/split modes).
          ================================================================ */}
      {showBackground && (
        <>
          {/* Background Image - covers entire slide */}
          <div className="absolute inset-0 z-0">
            <img
              src={slide.backgroundImageUrl}
              alt=""
              {...(slide.backgroundImageUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
              className="w-full h-full object-cover"
            />
          </div>
          {/* Solid Color Overlay */}
          <div
            className="absolute inset-0 z-[1]"
            style={{
              backgroundColor: bgOverlayColor,
              opacity: bgOverlayOpacity / 100
            }}
          />
        </>
      )}

      {/* ================================================================
          OVERLAY MODE (Cinematic Fade) - Illustration Image
          Image positioned absolutely, covering top portion of slide.
          A gradient fades from image into background color.
          Note: z-index is 2 to sit above background but below content
          ================================================================ */}
      {isOverlay && slide.imageUrl && (
        <div
            className="absolute top-0 left-0 right-0 z-[2]"
            style={{ height: `${overlayImageHeight}%`, overflow: 'hidden' }}
        >
          {/*
            IMAGE RENDERING:
            Always use <img> tag - works reliably for both preview and export.
            The crossOrigin="anonymous" attribute is required for html-to-image
            to capture external images without CORS errors.
          */}
          <img
            src={slide.imageUrl}
            alt="Background"
            {...(slide.imageUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
            className={`w-full h-full ${forExport ? '' : 'transition-all duration-300'}`}
            style={{
              objectFit: 'cover',
              objectPosition: `center ${imageOffsetY}%`
            }}
          />

          {/*
            GRADIENT FADE OVERLAY:
            Creates a smooth transition from image to solid background color.
            - Uses rgba() instead of 'transparent' keyword for html-to-image compatibility
            - pointerEvents: 'none' prevents gradient from blocking text interaction
          */}
          <div
            className="absolute bottom-0 left-0 right-0"
            data-gradient-overlay="true"
            style={{
                height: `${gradientHeight}%`,
                background: theme === 'DARK'
                  ? `linear-gradient(to bottom, rgba(10, 10, 10, 0), rgba(10, 10, 10, 1))`
                  : `linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(255, 255, 255, 1))`,
                pointerEvents: 'none'
            }}
          />
        </div>
      )}

      {/* --- SPLIT MODE (Hard Line) - Illustration Image --- */}
      {showSplit && slide.imageUrl && (
        <div
          className="w-full relative z-[2]"
          style={{
            height: `${splitImageHeight}%`,
            overflow: 'hidden',
            flexShrink: 0
          }}
        >
          <img
            src={slide.imageUrl}
            alt="Split View"
            {...(slide.imageUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
            className={`w-full h-full ${forExport ? '' : 'transition-all duration-300'}`}
            style={{
              objectFit: 'cover',
              objectPosition: `center ${imageOffsetY}%`,
              display: 'block'
            }}
          />
        </div>
      )}

      {/* --- TEXT CONTENT --- */}
      <div
        className={`flex-1 flex flex-col min-h-0 z-10 pb-32 relative ${showSplit ? '' : 'justify-center'}`}
        style={{
            height: showSplit ? `${splitTextHeight}%` : '100%',
            paddingTop: isOverlay && slide.imageUrl ? `${overlayTextPaddingTop}%` : (showSplit ? '3rem' : '0'),
            paddingLeft: `${effectiveContentPadding}px`,
            paddingRight: `${effectiveContentPadding}px`
        }}
      >
          <div className="w-full h-full overflow-hidden flex flex-col">
               <div className={`flex-1 w-full overflow-y-auto pr-4 no-scrollbar ${!showSplit && 'flex flex-col justify-center'}`}>
                    {renderMarkdown(slide.content, theme, accentColor, effectiveFontScale, effectiveLineHeight, effectiveParagraphGap, textColorOverride, effectiveTextAlignment)}
               </div>
          </div>
      </div>

      {/* --- FOOTER: Branding + Pagination --- */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center justify-end"
        style={{ paddingBottom: `${marginBottom}px` }}
      >
         {/* Branding - same code for both preview and export since html-to-image captures actual rendered pixels */}
         <div className="mb-4 bg-black/5 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10 flex items-center gap-3">
           <img
             src={profile.avatarUrl || "https://picsum.photos/200"}
             alt={profile.name}
             {...(profile.avatarUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
             className="rounded-full object-cover border border-white/20"
             style={{
               width: `${avatarSize}px`,
               height: `${avatarSize}px`
             }}
           />
           <span className="flex items-center gap-1">
             <span
               className={`font-bold ${theme === 'DARK' ? 'text-white' : 'text-black'}`}
               style={{ fontSize: `${nameSize}px` }}
             >
               @{profile.handle}
             </span>
             {showVerifiedBadge && (
               <img
                 src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Twitter_Verified_Badge.svg/1200px-Twitter_Verified_Badge.svg.png"
                 alt="Verified"
                 crossOrigin="anonymous"
                 style={{
                   width: `${verifiedSize}px`,
                   height: `${verifiedSize}px`
                 }}
               />
             )}
           </span>
         </div>

         {/* Pagination */}
         {showSlideNumbers && (
            <div className={`text-xl font-bold tracking-widest opacity-60 ${theme === 'DARK' ? 'text-white' : 'text-black'}`}>
                {index + 1} • {total}
            </div>
         )}
      </div>

    </div>
  );
};

export default StorytellerSlide;
