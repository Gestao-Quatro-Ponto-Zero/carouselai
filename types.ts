/**
 * CarouselAI Type Definitions
 *
 * Central hub for all TypeScript interfaces and enums used throughout the app.
 * These types define the data models that flow between components.
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Slide role classification for content structure.
 * Used by AI generation to create proper carousel flow.
 */
export enum SlideType {
  COVER = 'COVER',       // First slide: Hook/attention grabber
  CONTENT = 'CONTENT',   // Middle slides: Educational/informational
  CTA = 'CTA'            // Last slide: Call to action
}

/**
 * Visual template/style for the carousel.
 * Each style has its own component (TwitterSlide, StorytellerSlide).
 */
export enum CarouselStyle {
  TWITTER = 'TWITTER',           // Tweet screenshot aesthetic (text-focused)
  APPLE_NOTES = 'APPLE_NOTES',   // Reserved for future implementation
  STORYTELLER = 'STORYTELLER',   // Cinematic image overlays (image-focused)
  LESSON = 'LESSON'              // Educational content (image top, text below, centered footer)
}

// ============================================================================
// TYPE ALIASES
// ============================================================================

/**
 * Post dimensions using CSS aspect-ratio format.
 * Supported ratios for slide export.
 */
export type AspectRatio = '1/1' | '4/5' | '9/16' | '16/9';

/**
 * Color theme for slides.
 */
export type Theme = 'LIGHT' | 'DARK';

/**
 * Font style options for slides.
 * - MODERN: Clean sans-serif (system default)
 * - SERIF: Classic serif font for elegant/editorial look
 * - TECH: Monospace/technical font for developer/startup content
 */
export type FontStyle = 'MODERN' | 'SERIF' | 'TECH';

/**
 * Content layout options for element ordering (Twitter style).
 * Controls where the illustration image appears relative to text content.
 * - default: Header → All Content → Image (current behavior)
 * - image-after-title: Header → Title(H1/H2) → Image → Body text
 * - image-first: Header → Image → All Content
 */
export type ContentLayout = 'default' | 'image-after-title' | 'image-first';

/**
 * Text alignment options for slide content.
 * Controls horizontal alignment of text elements.
 */
export type TextAlignment = 'left' | 'center' | 'right';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Global layout settings for slides.
 * Controls padding, text spacing, and image positioning.
 * Per-slide overrides can be set in Slide interface.
 */
export interface LayoutSettings {
  contentPadding: number;      // 32-96 (px), default 64
  imageCanvasOffset: number;   // -200 to +200 (px), default 0 (Twitter only) - allows overflow beyond slide
  imageMargin: number;         // 0-32 (px), default 0 (Twitter only)
  textLineHeight: number;      // 1.2-2.0, default 1.5
  paragraphGap: number;        // 0.5-2.0 (rem), default 1
  textAlignment: TextAlignment; // left, center, right - default 'left'
}

/**
 * User/creator profile displayed on slides.
 */
export interface Profile {
  name: string;       // Display name (e.g., "John Doe")
  handle: string;     // Username without @ (e.g., "johndoe")
  avatarUrl: string;  // Profile image URL or base64 data URI
}

/**
 * Individual slide data model.
 *
 * IMAGE PROPERTIES EXPLAINED:
 * These properties work together to control image display:
 *
 * - showImage: Master toggle - if false, no image is shown
 * - imageUrl: The actual image (base64 data URI or URL)
 * - imageScale: How much vertical space the image takes (10-90%)
 *   - Twitter: Image appears below text
 *   - Storyteller: Image height from top of slide
 *
 * - overlayImage (Storyteller only):
 *   - true/undefined: Overlay mode - text floats over image with gradient fade
 *   - false: Split mode - hard line between image and text
 *
 * - imageOffsetY: Vertical crop/alignment (0-100, default 50 = centered)
 *   Controls which part of the image is visible (like CSS object-position)
 *
 * - gradientHeight (Storyteller overlay only): Fade overlay intensity (0-100%)
 *   Higher = more gradual fade from image to background
 */
export interface Slide {
  id: string;                    // Unique identifier (UUID)
  type: SlideType;               // Role in carousel flow
  content: string;               // Markdown-formatted text content
  imageUrl?: string;             // Image source (data URI or URL)
  showImage: boolean;            // Whether to display an image
  imagePrompt?: string;          // AI prompt for (re)generating image
  imageScale?: number;           // Image height percentage (10-90)
  overlayImage?: boolean;        // Storyteller: overlay vs split mode
  imageOffsetY?: number;         // Vertical image alignment (0-100)
  gradientHeight?: number;       // Storyteller: gradient overlay size (0-100)
  fontStyle?: FontStyle;         // Per-slide font override (undefined = use global)
  fontScale?: number;            // Per-slide font size multiplier (0.5-1.5, undefined = use global)

  // Content layout (Twitter style)
  contentLayout?: ContentLayout; // Element ordering (default = 'default')

  // Background image (full-bleed with color overlay)
  showBackgroundImage?: boolean;      // Master toggle for background image
  backgroundImageUrl?: string;        // Full-bleed background image source
  backgroundOverlayColor?: string;    // Overlay color (hex, default: theme-based)
  backgroundOverlayOpacity?: number;  // Overlay opacity 0-100 (default: 50)

  // Per-slide layout overrides (undefined = use global LayoutSettings)
  contentPadding?: number;            // 32-96 (px)
  imageCanvasOffset?: number;         // -200 to +200 (px), Twitter only
  imageMargin?: number;               // 0-32 (px), Twitter only
  textLineHeight?: number;            // 1.2-2.0
  paragraphGap?: number;              // 0.5-2.0 (rem)
  backgroundTextColor?: string;       // hex color, for background image mode

  // Per-slide theme override (undefined = use global theme)
  theme?: Theme;                      // LIGHT or DARK

  // Spacing for image-after-title layout (Twitter style)
  imageTextSpacing?: number;          // 0-64 (px), spacing between image and body text

  // Text alignment (undefined = use global)
  textAlignment?: TextAlignment;      // left, center, right
}

/**
 * Complete carousel project data.
 * Used for saving/loading projects via JSON export/import.
 *
 * Includes all slides, profile info, and global settings so the
 * entire project can be restored exactly as it was.
 */
export interface CarouselProject {
  id: string;                      // Unique project identifier
  name: string;                    // User-friendly project name
  style: CarouselStyle;            // Visual template (Twitter/Storyteller)
  aspectRatio: AspectRatio;        // Slide dimensions
  profile: Profile;                // Creator info (name, handle, avatar)
  slides: Slide[];                 // All slide content and images

  // Global settings
  theme: Theme;                    // Light/Dark mode
  accentColor: string;             // Highlight color (hex)
  showAccent: boolean;             // Whether accent color is enabled
  showSlideNumbers: boolean;       // Display slide count (e.g., "1 • 7")
  showVerifiedBadge: boolean;      // Display verified checkmark
  headerScale: number;             // Header/footer size multiplier (0.5-2.0)
  fontStyle: FontStyle;            // Global font family
  fontScale: number;               // Global font size multiplier (0.5-1.5)
  globalImageStyle: string;        // Image generation style prefix
  layoutSettings?: LayoutSettings; // Global layout settings (padding, spacing, etc.)

  // Metadata
  createdAt: string;               // ISO timestamp of creation
  updatedAt: string;               // ISO timestamp of last modification
}

/**
 * Uploaded document for AI carousel generation.
 * Supports PDF (vision), TXT, and Markdown files.
 */
export interface UploadedDocument {
  name: string;                    // Original filename
  type: 'pdf' | 'txt' | 'md';      // File type
  content: string;                 // Extracted text (for txt/md)
  base64?: string;                 // Base64 data (for pdf - vision API)
  mimeType?: string;               // MIME type (for pdf)
  size: number;                    // File size in bytes
}

/**
 * Onboarding wizard step identifiers.
 * Controls which screen is displayed in App.tsx.
 */
export type AppStep =
  | 'FORMAT_SELECT'        // Step 1: Choose style
  | 'ASPECT_RATIO_SELECT'  // Step 2: Choose dimensions
  | 'PROFILE_INPUT'        // Step 3: Enter profile info
  | 'METHOD_SELECT'        // Step 4: AI or Manual
  | 'AI_INPUT'             // Step 5: AI topic input
  | 'WORKSPACE';           // Step 6: Main editor
