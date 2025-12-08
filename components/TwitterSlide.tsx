/**
 * TwitterSlide Component
 *
 * Renders slides in a classic Twitter/X screenshot aesthetic.
 * Clean, text-focused design with a profile header and optional image.
 *
 * DESIGN: Mimics the look of a tweet screenshot
 * - Profile avatar + name + handle at top
 * - Large, readable text content
 * - Optional image below content
 * - Pagination badge in footer
 *
 * SCALING: All font sizes are optimized for 1080px width export.
 * The headerScale prop allows adjusting the profile section size.
 */

import React from 'react';
import { Slide, Profile, Theme, FontStyle, ContentLayout } from '../types';

interface TwitterSlideProps {
  slide: Slide;
  profile: Profile;
  index: number;
  total: number;
  showSlideNumbers: boolean;
  headerScale?: number;      // Size multiplier for profile section (0.5 - 2.0)
  theme: Theme;
  forExport?: boolean;       // Not used in Twitter style (same rendering for both)
  showVerifiedBadge?: boolean;
  accentColor?: string;      // Used for pagination badge color
  fontStyle?: FontStyle;     // Global font style (can be overridden by slide)
  fontScale?: number;        // Global font scale (can be overridden by slide)
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
 * - **bold** → Strong weight
 * - *italic* → Italic style
 * - ~~strikethrough~~ → Crossed out text
 * - __underlined__ → Underlined text (different from Storyteller's highlight)
 *
 * The regex splits text while preserving markdown tokens as separate array elements,
 * which are then mapped to their respective React components.
 */
const parseInline = (text: string, theme: Theme) => {
  const boldColor = theme === 'DARK' ? 'text-white' : 'text-gray-900';
  const italicColor = theme === 'DARK' ? 'text-gray-300' : 'text-gray-800';
  const strikeColor = theme === 'DARK' ? 'text-gray-600' : 'text-gray-500';

  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|~~.*?~~|__.*?__)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className={`font-bold ${boldColor}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className={`italic ${italicColor}`}>{part.slice(1, -1)}</em>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={i} className={strikeColor}>{part.slice(2, -2)}</s>;
    if (part.startsWith('__') && part.endsWith('__')) return <u key={i} className="decoration-4 underline-offset-4">{part.slice(2, -2)}</u>;
    return part;
  });
};

/**
 * Renders full markdown content (block-level elements).
 *
 * SUPPORTED SYNTAX:
 * - # Header 1 → 7xl font (largest)
 * - ## Header 2 → 6xl font
 * - - bullet list → Bullet points
 * - 1. numbered list → Numbered items
 * - Empty line → Vertical spacing
 * - Regular text → 5xl paragraph
 *
 * FONT SCALING:
 * Base sizes are pre-calculated for 1080px width output, then multiplied by fontScale.
 * text-7xl ≈ 72px, text-6xl ≈ 60px, text-5xl ≈ 48px, text-4xl ≈ 36px
 */
const renderMarkdown = (text: string, theme: Theme, fontScale: number = 1.0) => {
  const lines = text.split('\n');

  const hColor = theme === 'DARK' ? 'text-white' : 'text-gray-900';
  const textColor = theme === 'DARK' ? 'text-gray-200' : 'text-gray-800';
  const bulletColor = theme === 'DARK' ? 'text-gray-500' : 'text-gray-400';
  const numberColor = theme === 'DARK' ? 'text-white' : 'text-gray-900';

  // Base font sizes in pixels (for 1080px width)
  const h1Size = 72 * fontScale;
  const h2Size = 60 * fontScale;
  const bodySize = 48 * fontScale;
  const bulletSize = 36 * fontScale;

  return lines.map((line, idx) => {
    const trimmed = line.trim();

    // Headers
    if (line.startsWith('# ')) {
      return <h1 key={idx} className={`font-extrabold leading-tight mb-8 tracking-tight ${hColor}`} style={{ fontSize: `${h1Size}px` }}>{parseInline(line.slice(2), theme)}</h1>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={idx} className={`font-bold leading-tight mb-6 tracking-tight ${hColor}`} style={{ fontSize: `${h2Size}px` }}>{parseInline(line.slice(3), theme)}</h2>;
    }

    // Bullet list
    if (trimmed.startsWith('- ')) {
       return (
         <div key={idx} className="flex items-start mb-4 ml-2">
            <span className={`mr-4 mt-1 ${bulletColor}`} style={{ fontSize: `${bulletSize}px` }}>•</span>
            <span className={`leading-normal ${textColor}`} style={{ fontSize: `${bodySize}px` }}>{parseInline(line.slice(2), theme)}</span>
         </div>
       );
    }

    // Numbered list
    if (/^\d+\. /.test(trimmed)) {
        const number = trimmed.match(/^\d+/)?.[0];
        const content = trimmed.replace(/^\d+\. /, '');
        return (
            <div key={idx} className="flex items-start mb-4 ml-2">
               <span className={`mr-4 font-bold ${numberColor}`} style={{ fontSize: `${bodySize}px` }}>{number}.</span>
               <span className={`leading-normal ${textColor}`} style={{ fontSize: `${bodySize}px` }}>{parseInline(content, theme)}</span>
            </div>
          );
    }

    // Empty lines create vertical spacing
    if (!trimmed) return <div key={idx} className="h-8"></div>;

    // Regular paragraph
    return <p key={idx} className={`leading-relaxed mb-6 ${textColor}`} style={{ fontSize: `${bodySize}px` }}>{parseInline(line, theme)}</p>;
  });
};

/**
 * Splits content into title (H1/H2 headers) and body (everything else).
 * Used for 'image-after-title' layout to render image between headers and body.
 */
const splitContentByHeaders = (content: string): { titleLines: string; bodyLines: string } => {
  const lines = content.split('\n');
  const titleLines: string[] = [];
  const bodyLines: string[] = [];
  let foundNonHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Consider lines starting with # or ## as title content
    // Also include empty lines before body starts as part of title
    if (!foundNonHeader && (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed === '')) {
      titleLines.push(line);
    } else {
      foundNonHeader = true;
      bodyLines.push(line);
    }
  }

  return {
    titleLines: titleLines.join('\n'),
    bodyLines: bodyLines.join('\n')
  };
};

// ============================================================================
// COMPONENT
// ============================================================================

const TwitterSlide: React.FC<TwitterSlideProps> = ({ slide, profile, index, total, showSlideNumbers, headerScale = 1.0, theme, forExport = false, showVerifiedBadge = true, accentColor, fontStyle = 'MODERN', fontScale = 1.0 }) => {

  // LAYOUT CALCULATIONS
  // When an image is shown, it takes imageScale% of height; text takes the rest
  const imageScale = slide.imageScale || 50;  // Default 50% for Twitter style
  const textHeightPercent = slide.showImage ? 100 - imageScale : 100;
  const imageHeightPercent = slide.showImage ? imageScale : 0;
  const imageOffsetY = slide.imageOffsetY !== undefined ? slide.imageOffsetY : 50;

  // CONTENT LAYOUT (element ordering)
  const contentLayout: ContentLayout = slide.contentLayout || 'default';

  // BACKGROUND IMAGE SETTINGS
  const showBackground = slide.showBackgroundImage && slide.backgroundImageUrl;
  const bgOverlayColor = slide.backgroundOverlayColor || (theme === 'DARK' ? '#000000' : '#FFFFFF');
  const bgOverlayOpacity = slide.backgroundOverlayOpacity !== undefined ? slide.backgroundOverlayOpacity : 50;

  // Split content for 'image-after-title' layout
  const { titleLines, bodyLines } = contentLayout === 'image-after-title'
    ? splitContentByHeaders(slide.content)
    : { titleLines: '', bodyLines: '' };

  // FONT SETTINGS:
  // Per-slide settings override global settings
  const effectiveFontStyle = slide.fontStyle || fontStyle;
  const effectiveFontScale = slide.fontScale !== undefined ? slide.fontScale : fontScale;
  const fontFamily = getFontFamily(effectiveFontStyle);

  // DYNAMIC SCALING PATTERN:
  // All header dimensions are base values multiplied by headerScale.
  // This allows users to adjust the profile section size (50% to 200%).
  const avatarSize = 130 * headerScale;
  const nameSize = 48 * headerScale;
  const handleSize = 32 * headerScale;
  const verifiedSize = 40 * headerScale;
  const gapSize = 24 * headerScale;
  const marginBottom = 40 * headerScale;

  // Theme Base Colors
  const bgColor = theme === 'DARK' ? '#000000' : '#FFFFFF';
  
  const nameColor = theme === 'DARK' ? 'text-white' : 'text-gray-900';
  const handleColor = theme === 'DARK' ? 'text-gray-500' : 'text-gray-500';
  const borderColor = theme === 'DARK' ? 'border-gray-800' : 'border-gray-100';
  const imagePlaceholderBg = theme === 'DARK' ? 'bg-gray-900' : 'bg-gray-50';
  const imagePlaceholderBorder = theme === 'DARK' ? 'border-gray-800' : 'border-gray-200';
  const footerBg = theme === 'DARK' ? 'bg-gray-900' : 'bg-gray-100';
  const footerText = theme === 'DARK' ? 'text-gray-400' : 'text-gray-500';

  // ============================================================================
  // REUSABLE RENDER FUNCTIONS
  // ============================================================================

  /** Renders the illustration image section */
  const renderImage = () => {
    if (!slide.showImage) return null;

    return (
      <div
        className="w-full pt-8 transition-all duration-300 ease-in-out flex flex-col"
        style={{ height: `${imageHeightPercent}%` }}
      >
        {slide.imageUrl ? (
          <div className={`flex-1 w-full rounded-3xl overflow-hidden border ${borderColor} relative shadow-sm`}>
            <img
              src={slide.imageUrl}
              alt="Slide visual"
              {...(slide.imageUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
              className="w-full h-full object-cover"
              style={{ objectPosition: `center ${imageOffsetY}%` }}
            />
          </div>
        ) : (
          <div className={`flex-1 w-full rounded-3xl ${imagePlaceholderBg} flex items-center justify-center border-4 border-dashed ${imagePlaceholderBorder}`}>
            <div className="flex flex-col items-center text-gray-500 animate-pulse scale-150">
              <svg className="w-12 h-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-lg font-medium">Generating...</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  /** Renders text content */
  const renderTextContent = (content: string, heightPercent: number) => (
    <div
      className="w-full overflow-hidden flex flex-col transition-all duration-300 ease-in-out"
      style={{ height: `${heightPercent}%` }}
    >
      <div className="flex-1 w-full overflow-y-auto pr-4 no-scrollbar">
        {renderMarkdown(content, theme, effectiveFontScale)}
      </div>
    </div>
  );

  // ============================================================================
  // LAYOUT RENDERING BASED ON contentLayout
  // ============================================================================

  const renderMainContent = () => {
    switch (contentLayout) {
      case 'image-first':
        // Image → All Content
        return (
          <div className="flex-1 flex flex-col min-h-0">
            {renderImage()}
            {renderTextContent(slide.content, slide.showImage ? textHeightPercent : 100)}
          </div>
        );

      case 'image-after-title':
        // Title(H1/H2) → Image → Body
        return (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Title section (no fixed height - shrinks to content) */}
            {titleLines.trim() && (
              <div className="flex-shrink-0 w-full overflow-hidden">
                <div className="w-full overflow-y-auto pr-4 no-scrollbar">
                  {renderMarkdown(titleLines, theme, effectiveFontScale)}
                </div>
              </div>
            )}
            {renderImage()}
            {/* Body section (fills remaining space) */}
            {bodyLines.trim() && (
              <div className="flex-1 w-full overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 w-full overflow-y-auto pr-4 no-scrollbar">
                  {renderMarkdown(bodyLines, theme, effectiveFontScale)}
                </div>
              </div>
            )}
          </div>
        );

      case 'default':
      default:
        // All Content → Image (current behavior)
        return (
          <div className="flex-1 flex flex-col min-h-0">
            {renderTextContent(slide.content, textHeightPercent)}
            {renderImage()}
          </div>
        );
    }
  };

  return (
    <div
      className={`w-full h-full flex flex-col relative overflow-hidden shadow-sm ${forExport ? '' : 'transition-colors duration-300'}`}
      style={{ backgroundColor: bgColor, fontFamily }}
    >

      {/* ================================================================
          BACKGROUND IMAGE LAYER (z-0)
          Full-bleed background with color overlay for cinematic effect
          ================================================================ */}
      {showBackground && (
        <>
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
            <img
              src={slide.backgroundImageUrl}
              alt=""
              {...(slide.backgroundImageUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
              className="w-full h-full object-cover"
            />
          </div>
          {/* Color Overlay */}
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
          MAIN CONTENT (z-10)
          All content sits above background layers
          ================================================================ */}
      <div className="relative z-10 w-full h-full flex flex-col p-16">

        {/* Header: Profile - Dynamically Scaled */}
        <div
          className="flex-none flex items-center"
          style={{ marginBottom: `${marginBottom}px`, gap: `${gapSize}px` }}
        >
          <img
            src={profile.avatarUrl || "https://picsum.photos/200"}
            alt={profile.name}
            {...(profile.avatarUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
            className={`rounded-full object-cover border-2 ${borderColor}`}
            style={{ width: `${avatarSize}px`, height: `${avatarSize}px` }}
          />
          <div className="flex flex-col justify-center" style={{ flex: '1 1 0%', minWidth: 0 }}>
            <div className="flex items-baseline" style={{ gap: `${gapSize * 0.5}px` }}>
              <span
                  className={`font-bold ${nameColor} truncate`}
                  style={{ fontSize: `${nameSize}px`, lineHeight: 1.5, paddingBottom: '4px' }}
              >
                  {profile.name}
              </span>
              {showVerifiedBadge && (
                  <img
                      src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Twitter_Verified_Badge.svg/1200px-Twitter_Verified_Badge.svg.png"
                      alt="Verified"
                      crossOrigin="anonymous"
                      className="object-contain flex-shrink-0"
                      style={{
                        width: `${verifiedSize}px`,
                        height: `${verifiedSize}px`,
                        alignSelf: 'center',
                        marginTop: `-${verifiedSize * 0.1}px`
                      }}
                  />
              )}
            </div>
            <div
              className={`${handleColor}`}
              style={{ fontSize: `${handleSize}px`, lineHeight: 1.3, marginTop: `${4 * headerScale}px` }}
            >
              @{profile.handle}
            </div>
          </div>
        </div>

        {/* Main Content Area - layout varies based on contentLayout */}
        {renderMainContent()}

        {/* Footer / Pagination */}
        {showSlideNumbers && (
          <div className="flex-none pt-8 flex justify-end">
             <div
               className={`text-2xl ${footerBg} ${footerText} px-6 py-2 rounded-full font-bold tracking-wide`}
               style={accentColor ? { color: accentColor } : {}}
              >
               {index + 1} / {total}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TwitterSlide;
