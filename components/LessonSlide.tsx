/**
 * LessonSlide Component
 *
 * Renders slides in an educational, lesson-focused aesthetic.
 * Designed for clear, readable content with per-slide black/white theme selection.
 *
 * LAYOUT MODES:
 * 1. COVER (SlideType.COVER): Background image at top, centered title below, centered footer
 * 2. CONTENT (text-only): Full slide with title, body text, and centered footer
 * 3. CONTENT (with image): Title at top, image below title, body text below image, centered footer
 *
 * KEY FEATURES:
 * - Per-slide black/white (DARK/LIGHT) theme selection
 * - Centered footer with handle and verified badge (like Storyteller)
 * - Image always appears below title when enabled
 */

import React from 'react';
import { Slide, Profile, Theme, FontStyle, LayoutSettings, SlideType, TextAlignment } from '../types';

interface LessonSlideProps {
  slide: Slide;
  profile: Profile;
  index: number;
  total: number;
  showSlideNumbers: boolean;
  headerScale?: number;      // Size multiplier for footer elements (0.5 - 2.0)
  theme: Theme;
  forExport?: boolean;       // True when rendering for PNG capture
  showVerifiedBadge?: boolean;
  accentColor?: string;      // Highlight color for pagination
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
 */
const parseInline = (text: string, theme: Theme, accentColor?: string) => {
  const boldColor = theme === 'DARK' ? 'text-white' : 'text-black';
  const italicColor = theme === 'DARK' ? 'text-gray-300' : 'text-gray-600';

  const highlightStyle = accentColor
    ? { backgroundColor: `${accentColor}4D` }
    : { backgroundColor: theme === 'DARK' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' };

  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|~~.*?~~|__.*?__)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className={`font-bold ${boldColor}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className={`italic ${italicColor}`}>{part.slice(1, -1)}</em>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={i} className="opacity-70">{part.slice(2, -2)}</s>;
    if (part.startsWith('__') && part.endsWith('__')) return <span key={i} style={highlightStyle} className="px-1 rounded font-semibold">{part.slice(2, -2)}</span>;
    return part;
  });
};

/**
 * Renders markdown content with customizable styling.
 */
const renderMarkdown = (
  text: string,
  theme: Theme,
  accentColor?: string,
  fontScale: number = 1.0,
  lineHeight: number = 1.5,
  paragraphGap: number = 1,
  textAlignment: TextAlignment = 'left'
) => {
  const lines = text.split('\n');
  const textColor = theme === 'DARK' ? '#F3F4F6' : '#111827';
  const headingColor = theme === 'DARK' ? '#FFFFFF' : '#000000';
  const bulletStyle = accentColor
    ? { color: accentColor }
    : { color: theme === 'DARK' ? '#cbd5e1' : '#475569' };

  // Base font sizes in pixels (for 1080px width)
  const h1Size = 72 * fontScale;
  const h2Size = 48 * fontScale;
  const bodySize = 36 * fontScale;

  const paragraphSpacing = paragraphGap * 16;
  const listJustify = textAlignment === 'center' ? 'justify-center' : textAlignment === 'right' ? 'justify-end' : '';

  return lines.map((line, idx) => {
    const trimmed = line.trim();

    // Headers
    if (line.startsWith('# ')) {
      return (
        <h1
          key={idx}
          className="font-black tracking-tighter"
          style={{ fontSize: `${h1Size}px`, lineHeight: lineHeight, marginBottom: `${paragraphSpacing}px`, color: headingColor, textAlign: textAlignment }}
        >
          {parseInline(line.slice(2), theme, accentColor)}
        </h1>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2
          key={idx}
          className="font-extrabold tracking-tight"
          style={{ fontSize: `${h2Size}px`, lineHeight: lineHeight, marginBottom: `${paragraphSpacing * 0.75}px`, color: headingColor, textAlign: textAlignment }}
        >
          {parseInline(line.slice(3), theme, accentColor)}
        </h2>
      );
    }

    // Bullet list
    if (trimmed.startsWith('- ')) {
      return (
        <div key={idx} className={`flex items-start ${textAlignment === 'left' ? 'ml-2' : ''} ${listJustify}`} style={{ marginBottom: `${paragraphSpacing * 0.5}px` }}>
          <span className="mr-4 mt-1" style={{ ...bulletStyle, fontSize: `${bodySize}px` }}>●</span>
          <span className="font-medium" style={{ fontSize: `${bodySize}px`, lineHeight: lineHeight, color: textColor }}>{parseInline(line.slice(2), theme, accentColor)}</span>
        </div>
      );
    }

    // Numbered list
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

    // Body text
    return (
      <p
        key={idx}
        className="font-medium"
        style={{ fontSize: `${bodySize}px`, lineHeight: lineHeight, marginBottom: `${paragraphSpacing}px`, color: textColor, textAlign: textAlignment }}
      >
        {parseInline(line, theme, accentColor)}
      </p>
    );
  });
};

/**
 * Splits content into title (H1/H2 headers) and body (everything else).
 */
const splitContentByHeaders = (content: string): { titleLines: string; bodyLines: string } => {
  const lines = content.split('\n');
  const titleLines: string[] = [];
  const bodyLines: string[] = [];
  let foundNonHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
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

const LessonSlide: React.FC<LessonSlideProps> = ({
  slide,
  profile,
  index,
  total,
  showSlideNumbers,
  headerScale = 1.0,
  theme,
  forExport = false,
  showVerifiedBadge = true,
  accentColor,
  fontStyle = 'MODERN',
  fontScale = 1.0,
  layoutSettings
}) => {

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

  // FONT SETTINGS
  const effectiveFontStyle = slide.fontStyle || fontStyle;
  const effectiveFontScale = slide.fontScale !== undefined ? slide.fontScale : fontScale;
  const fontFamily = getFontFamily(effectiveFontStyle);

  // IMAGE SETTINGS
  const imageScale = slide.imageScale || 50;
  const imageOffsetY = slide.imageOffsetY !== undefined ? slide.imageOffsetY : 50;
  const gradientHeight = slide.gradientHeight !== undefined ? slide.gradientHeight : 60;
  const imageTextSpacing = slide.imageTextSpacing ?? 16;
  // Cover slide mode: true/undefined = overlay (gradient), false = split (no overlay)
  const isOverlayMode = slide.overlayImage !== false;
  // Gradient/overlay opacity (0-100, default 100 for full fade)
  const gradientOpacity = slide.backgroundOverlayOpacity !== undefined ? slide.backgroundOverlayOpacity / 100 : 1;

  // BACKGROUND IMAGE SETTINGS (for all slides, like Twitter/Storyteller)
  const showBackground = slide.showBackgroundImage && slide.backgroundImageUrl;
  const bgOverlayColor = slide.backgroundOverlayColor || (theme === 'DARK' ? '#000000' : '#FFFFFF');
  const bgOverlayOpacity = slide.backgroundOverlayOpacity !== undefined ? slide.backgroundOverlayOpacity : 50;
  const bgTextColor = slide.backgroundTextColor;

  // THEME COLORS (pure black/white)
  const bgColor = theme === 'DARK' ? '#000000' : '#FFFFFF';
  const textColor = bgTextColor || (theme === 'DARK' ? '#FFFFFF' : '#000000');

  // FOOTER SIZING
  const avatarSize = 64 * headerScale;
  const nameSize = 32 * headerScale;
  const verifiedSize = 28 * headerScale;
  const footerPaddingBottom = 60 * headerScale;

  // Determine if this is a cover slide
  const isCover = slide.type === SlideType.COVER;

  // For cover slides, use background image settings
  const showCoverImage = isCover && slide.showBackgroundImage && slide.backgroundImageUrl;

  // For content slides with images, split the content
  const { titleLines, bodyLines } = !isCover && slide.showImage
    ? splitContentByHeaders(slide.content)
    : { titleLines: '', bodyLines: '' };

  // ============================================================================
  // FOOTER COMPONENT (Centered, like Storyteller)
  // ============================================================================
  const renderFooter = () => (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center justify-end"
      style={{ paddingBottom: `${footerPaddingBottom}px` }}
    >
      {/* Branding */}
      <div className="mb-4 bg-black/5 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10 flex items-center gap-3">
        <img
          src={profile.avatarUrl || "https://picsum.photos/200"}
          alt={profile.name}
          {...(profile.avatarUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
          className="rounded-full object-cover border border-white/20"
          style={{ width: `${avatarSize}px`, height: `${avatarSize}px` }}
        />
        <span className="flex items-center gap-1">
          <span
            className="font-bold"
            style={{ fontSize: `${nameSize}px`, color: textColor }}
          >
            @{profile.handle}
          </span>
          {showVerifiedBadge && (
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Twitter_Verified_Badge.svg/1200px-Twitter_Verified_Badge.svg.png"
              alt="Verified"
              crossOrigin="anonymous"
              style={{ width: `${verifiedSize}px`, height: `${verifiedSize}px` }}
            />
          )}
        </span>
      </div>

      {/* Pagination */}
      {showSlideNumbers && (
        <div
          className="text-xl font-bold tracking-widest opacity-60"
          style={{ color: textColor }}
        >
          {index + 1} • {total}
        </div>
      )}
    </div>
  );

  // ============================================================================
  // COVER SLIDE RENDERING
  // ============================================================================

  const renderCoverSlide = () => {
    // OVERLAY MODE: Full background image with gradient fade
    if (isOverlayMode) {
      return (
        <>
          {/* Background Image - Full Screen */}
          {showCoverImage && (
            <div className="absolute inset-0 z-[2]">
              <img
                src={slide.backgroundImageUrl}
                alt=""
                {...(slide.backgroundImageUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
                className={`w-full h-full ${forExport ? '' : 'transition-all duration-300'}`}
                style={{
                  objectFit: 'cover',
                  objectPosition: `center ${imageOffsetY}%`
                }}
              />

              {/* Gradient Fade Overlay - position controlled by imageScale */}
              <div
                className="absolute left-0 right-0"
                data-gradient-overlay="true"
                style={{
                  top: `${imageScale}%`,
                  height: `${gradientHeight}%`,
                  background: theme === 'DARK'
                    ? `linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, ${gradientOpacity}))`
                    : `linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(255, 255, 255, ${gradientOpacity}))`,
                  pointerEvents: 'none'
                }}
              />
            </div>
          )}

          {/* Text Content Area - vertical position controlled by imageOffsetY */}
          <div
            className="absolute inset-0 flex flex-col items-center z-10"
            style={{
              paddingLeft: `${effectiveContentPadding}px`,
              paddingRight: `${effectiveContentPadding}px`,
              paddingBottom: `${footerPaddingBottom + 80}px`,
              top: `${imageOffsetY}%`
            }}
          >
            <div className="flex-1 flex items-end w-full">
              <div className="w-full">
                {renderMarkdown(slide.content, theme, accentColor, effectiveFontScale, effectiveLineHeight, effectiveParagraphGap, effectiveTextAlignment)}
              </div>
            </div>
          </div>

          {/* Footer */}
          {renderFooter()}
        </>
      );
    }

    // SPLIT MODE: Image on top half, text below (no overlay)
    return (
      <>
        {/* Top Image Section */}
        {showCoverImage && (
          <div
            className="flex-shrink-0 w-full overflow-hidden"
            style={{ height: `${imageScale}%` }}
          >
            <img
              src={slide.backgroundImageUrl}
              alt=""
              {...(slide.backgroundImageUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
              className={`w-full h-full ${forExport ? '' : 'transition-all duration-300'}`}
              style={{
                objectFit: 'cover',
                objectPosition: `center ${imageOffsetY}%`
              }}
            />
          </div>
        )}

        {/* Text Content Area (below image) */}
        <div
          className="flex-1 flex flex-col items-center justify-center min-h-0 pb-32"
          style={{
            paddingLeft: `${effectiveContentPadding}px`,
            paddingRight: `${effectiveContentPadding}px`,
            paddingTop: `${effectiveContentPadding / 2}px`
          }}
        >
          <div className="w-full">
            {renderMarkdown(slide.content, theme, accentColor, effectiveFontScale, effectiveLineHeight, effectiveParagraphGap, effectiveTextAlignment)}
          </div>
        </div>

        {/* Footer */}
        {renderFooter()}
      </>
    );
  };

  // ============================================================================
  // CONTENT SLIDE WITH IMAGE RENDERING
  // ============================================================================
  const renderContentWithImage = () => (
    <>
      <div
        className="flex-1 flex flex-col min-h-0 pb-32 relative z-10"
        style={{
          paddingLeft: `${effectiveContentPadding}px`,
          paddingRight: `${effectiveContentPadding}px`,
          paddingTop: `${effectiveContentPadding}px`
        }}
      >
        {/* Title Section */}
        {titleLines.trim() && (
          <div className="flex-shrink-0 w-full mb-4">
            {renderMarkdown(titleLines, theme, accentColor, effectiveFontScale, effectiveLineHeight, effectiveParagraphGap, effectiveTextAlignment)}
          </div>
        )}

        {/* Image Below Title */}
        <div
          className="w-full flex-shrink-0"
          style={{ height: `${imageScale}%` }}
        >
          {slide.imageUrl ? (
            <div className="w-full h-full rounded-2xl overflow-hidden">
              <img
                src={slide.imageUrl}
                alt="Slide visual"
                {...(slide.imageUrl?.startsWith('data:') ? {} : { crossOrigin: 'anonymous' })}
                className={`w-full h-full object-cover ${forExport ? '' : 'transition-all duration-300'}`}
                style={{ objectPosition: `center ${imageOffsetY}%` }}
              />
            </div>
          ) : (
            <div className={`w-full h-full rounded-2xl flex items-center justify-center border-4 border-dashed ${theme === 'DARK' ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex flex-col items-center text-gray-500 animate-pulse scale-150">
                <svg className="w-12 h-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-lg font-medium">Generating...</span>
              </div>
            </div>
          )}
        </div>

        {/* Body Text Below Image */}
        {bodyLines.trim() && (
          <div
            className="flex-1 w-full overflow-y-auto pr-4 no-scrollbar"
            style={{ paddingTop: `${imageTextSpacing}px` }}
          >
            {renderMarkdown(bodyLines, theme, accentColor, effectiveFontScale, effectiveLineHeight, effectiveParagraphGap, effectiveTextAlignment)}
          </div>
        )}
      </div>

      {/* Footer */}
      {renderFooter()}
    </>
  );

  // ============================================================================
  // CONTENT SLIDE TEXT-ONLY RENDERING
  // ============================================================================
  const renderContentTextOnly = () => (
    <>
      <div
        className="flex-1 flex flex-col min-h-0 pb-32 relative z-10"
        style={{
          paddingLeft: `${effectiveContentPadding}px`,
          paddingRight: `${effectiveContentPadding}px`,
          paddingTop: `${effectiveContentPadding}px`
        }}
      >
        <div className="flex-1 w-full overflow-y-auto pr-4 no-scrollbar">
          {renderMarkdown(slide.content, theme, accentColor, effectiveFontScale, effectiveLineHeight, effectiveParagraphGap, effectiveTextAlignment)}
        </div>
      </div>

      {/* Footer */}
      {renderFooter()}
    </>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <div
      className={`w-full h-full flex flex-col relative overflow-hidden ${forExport ? '' : 'transition-colors duration-300'}`}
      style={{ backgroundColor: bgColor, fontFamily }}
    >
      {/* Background Image Layer (for non-cover slides, like Twitter/Storyteller) */}
      {!isCover && showBackground && (
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

      {isCover ? renderCoverSlide() : (
        slide.showImage ? renderContentWithImage() : renderContentTextOnly()
      )}
    </div>
  );
};

export default LessonSlide;
