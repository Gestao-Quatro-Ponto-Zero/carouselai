/**
 * Gemini AI Service
 *
 * Handles all interactions with Google's Gemini AI API:
 * - API key management (localStorage with env fallback)
 * - Text generation for carousel content
 * - Image generation from prompts
 * - Image stylization (image-to-image transformation)
 *
 * FALLBACK STRATEGY:
 * - Text models: Pro 3 → Pro 2.5 → Flash (recursive on any error)
 * - Image models: Pro → Flash (only on 403 permission errors)
 */

import { GoogleGenAI, Type, createPartFromUri } from "@google/genai";
import { Slide, SlideType, AspectRatio, UploadedDocument } from "../types";
import {
  extractInstagramUrls,
  hasApifyApiKey,
  scrapeInstagramPost,
  downloadMediaAsBlob,
  formatInstagramContentForAI,
} from "./instagramService";

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Retrieves the API key from storage.
 * Priority: localStorage (user-entered) → environment variable → empty string
 *
 * The window check prevents SSR errors in case this is used with frameworks like Next.js
 */
const getStoredApiKey = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('gemini_api_key') || process.env.API_KEY || '';
  }
  return process.env.API_KEY || '';
};

// Module-level singleton - recreated when setApiKey() is called
let ai = new GoogleGenAI({ apiKey: getStoredApiKey() });

/**
 * Updates the API key at runtime.
 * Persists to localStorage and recreates the AI client instance.
 */
export const setApiKey = (apiKey: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('gemini_api_key', apiKey);
  }
  ai = new GoogleGenAI({ apiKey });
};

/**
 * Returns a masked version of the API key for display in the UI.
 * Shows first 4 and last 4 characters: "AIza****pzrw"
 */
export const getApiKeyMasked = (): string => {
  const key = getStoredApiKey();
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
};

/**
 * Checks if an API key is configured (either in localStorage or env).
 */
export const hasApiKey = (): boolean => {
  return !!getStoredApiKey();
};

// ============================================================================
// MODEL CONSTANTS
// ============================================================================

// Text generation models (used for carousel content)
// Fallback chain: PRO → FLASH
export const TEXT_MODEL_PRO = "gemini-3-pro-preview";
export const TEXT_MODEL_FLASH = "gemini-2.5-flash";

// Image generation models (Gemini's image generation API)
// Pro offers 2K resolution but may have restricted access
// Flash is the fallback with broader availability
export const IMAGE_MODEL_PRO = "gemini-3-pro-image-preview";
export const IMAGE_MODEL_FLASH = "gemini-2.5-flash-image";

// ============================================================================
// YOUTUBE URL DETECTION
// ============================================================================

/**
 * Regex to match YouTube URLs in various formats:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 */
const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]{11}/g;

/**
 * Extracts all YouTube URLs from a text string.
 * Returns an array of full URL matches.
 */
const extractYouTubeUrls = (text: string): string[] => {
  const matches = text.match(YOUTUBE_URL_REGEX);
  return matches || [];
};

/**
 * Normalizes a YouTube URL to the standard format.
 * Ensures URLs have https:// prefix for API compatibility.
 */
const normalizeYouTubeUrl = (url: string): string => {
  if (!url.startsWith('http')) {
    return `https://${url}`;
  }
  return url;
};

// ============================================================================
// ASPECT RATIO MAPPING
// ============================================================================

/**
 * Converts app's aspect ratio format (CSS-style) to API format (colon-separated).
 * Gemini image API supports: "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
 */
export const getApiAspectRatio = (ratio: AspectRatio): string => {
  const mapping: Record<AspectRatio, string> = {
    '1/1': '1:1',
    '4/5': '4:5',
    '9/16': '9:16',
    '16/9': '16:9'
  };
  return mapping[ratio] || '1:1';
};

// ============================================================================
// FILE UPLOAD (for Instagram media)
// ============================================================================

/**
 * Uploads a blob to Gemini Files API and waits for it to be ready.
 * Polls file state until ACTIVE (required before use in prompts).
 * Used for uploading Instagram images/videos.
 * Files are auto-deleted after 48 hours.
 *
 * @param blob - Media file as Blob (from downloadMediaAsBlob)
 * @param displayName - Filename for identification
 * @returns Object with uri and mimeType for use with createPartFromUri
 */
const uploadToGemini = async (blob: Blob, displayName: string): Promise<{ uri: string; mimeType: string }> => {
  let file = await ai.files.upload({
    file: blob,
    config: { displayName }
  });

  // Poll until file is ACTIVE (processing complete)
  // Videos may take longer to process than images
  const maxAttempts = 30; // 60 seconds max wait (polling every 2s)
  let attempts = 0;

  while (file.state !== 'ACTIVE' && attempts < maxAttempts) {
    console.log(`File processing... (${file.state})`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    file = await ai.files.get({ name: file.name! });
    attempts++;
  }

  if (file.state !== 'ACTIVE') {
    throw new Error(`File failed to process after ${maxAttempts * 2}s: state=${file.state}`);
  }

  console.log(`File ready: ${displayName}`);
  return { uri: file.uri!, mimeType: file.mimeType! };
};

// ============================================================================
// DOCUMENT PROCESSING
// ============================================================================

/**
 * Processes an uploaded file and extracts content for AI generation.
 *
 * STRATEGY BY FILE TYPE:
 * - PDF: Read as base64 for Gemini vision (preserves charts/diagrams)
 * - TXT/MD: Extract text directly via FileReader
 *
 * @param file - The uploaded File object
 * @returns Promise<UploadedDocument> with extracted content
 */
export const processDocument = async (file: File): Promise<UploadedDocument> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'pdf':
      return await processPdf(file);
    case 'txt':
    case 'md':
      return await processTextFile(file, extension as 'txt' | 'md');
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
};

/**
 * Processes PDF file - reads as base64 for Gemini vision API.
 * PDFs are sent as multimodal input so Gemini can see charts, diagrams, and images.
 */
const processPdf = async (file: File): Promise<UploadedDocument> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      // Remove "data:application/pdf;base64," prefix to get raw base64
      const base64 = dataUrl.split(',')[1];
      resolve({
        name: file.name,
        type: 'pdf',
        content: '', // Content will be extracted by Gemini vision
        base64,
        mimeType: 'application/pdf',
        size: file.size
      });
    };
    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Processes TXT/MD files - reads as plain text.
 */
const processTextFile = async (file: File, type: 'txt' | 'md'): Promise<UploadedDocument> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({
        name: file.name,
        type,
        content: e.target?.result as string,
        size: file.size
      });
    };
    reader.onerror = () => reject(new Error('Failed to read text file'));
    reader.readAsText(file);
  });
};

// ============================================================================
// TEXT GENERATION (Carousel Content)
// ============================================================================

/**
 * Schema for the JSON response from Gemini text generation.
 * This is what the AI returns; it gets mapped to the app's Slide interface.
 */
interface GeneratedSlideSchema {
  type: string;           // COVER, CONTENT, or CTA
  content: string;        // Markdown-formatted slide text
  suggestedImagePrompt: string;  // Prompt for later image generation
  needsImage: boolean;    // AI's recommendation on whether slide needs an image
}

/**
 * Generates carousel content (text + structure) using Gemini AI.
 *
 * Uses "structured output" to force the AI to return valid JSON matching our schema.
 * This ensures consistent, parseable responses without manual JSON extraction.
 *
 * @param topic - The subject matter for the carousel (e.g., "10 productivity tips")
 * @param count - Number of slides to generate (default: 7)
 * @param modelName - Which model to use (defaults to Pro, falls back automatically)
 * @param document - Optional uploaded document (PDF, TXT, MD) to use as source content
 * @returns Array of Slide objects ready for the editor
 *
 * FALLBACK CHAIN (recursive):
 * Pro 3 → Pro 2.5 → Flash
 * If any model fails, it automatically tries the next one down the chain.
 */
export const generateCarouselContent = async (
  topic: string,
  count: number = 7,
  modelName: string = TEXT_MODEL_PRO,
  document?: UploadedDocument
): Promise<Slide[]> => {
  // Build the prompt based on whether a document is attached
  const hasDocument = !!document;
  const documentInstruction = hasDocument
    ? "Analyze the attached document thoroughly. Extract the key insights, main arguments, and important data points. "
    : "";

  // For text files, append content to topic
  const effectiveTopic = document?.content
    ? (topic ? `${topic}\n\n--- Document Content ---\n${document.content}` : document.content)
    : topic;

  // PROMPT ENGINEERING: Creates a carousel using the AIDA framework:
  // - Slide 1: ATTENTION - Emotional, controversial hook
  // - Slides 2-N-1: INTEREST + DESIRE - Educational content with storytelling
  // - Slide N: ACTION - Call to Action
  const prompt = `
Act as a viral social media copywriter and storytelling expert. ${documentInstruction}Create an Instagram Carousel about the following topic: "${effectiveTopic}".

## CONTENT FRAMEWORK - AIDA Model with Storytelling

### Slide 1 - COVER (ATTENTION)
Create a title that triggers STRONG EMOTION. The hook must:
- Spark curiosity, controversy, or outrage
- Challenge common beliefs or reveal a "dirty secret"
- Use power words: "Why...", "The truth about...", "Stop doing...", "Nobody tells you..."
- Make it IMPOSSIBLE to scroll past without reading more
Type: COVER

### Slides 2-${Math.ceil((count - 2) * 0.3) + 1} - INTEREST (First content slides)
Hook the reader deeper with:
- Surprising statistics or counterintuitive insights
- "Wait, what?" moments that build intrigue
- Promise of valuable information to come
Type: CONTENT

### Slides ${Math.ceil((count - 2) * 0.3) + 2}-${count - 1} - INTEREST + DESIRE (Middle to final content slides)
Deliver value while building desire:
- Main educational content and insights
- Show the transformation possible
- Include social proof or relatable examples
- Create "I need this" moments
- Final content slide should create urgency and anticipation for the CTA
Type: CONTENT

### Slide ${count} - ACTION (CTA)
Clear, compelling call to action:
- Tell them exactly what to do next
- Make it easy to take action
- Connect back to the desire built throughout
Type: CTA

## STORYTELLING REQUIREMENTS
1. Every slide must flow naturally into the next - no disconnected points
2. Use a consistent narrative voice throughout
3. Build tension and release it with value
4. End each slide with an implicit "and then..." that pulls to the next

## FORMATTING
- Use Markdown for emphasis (# Header, **bold**)
- Keep text concise and punchy (tweet-length per slide)
- Use bullet points sparingly for lists

Create exactly ${count} slides.
For each slide, determine if an image would enhance engagement (needsImage).
Provide a 'suggestedImagePrompt' for image generation. If no image needed, return empty string.

Return strictly JSON.
`;

  // Build contents based on input type
  // Priority: PDF document → Instagram URLs → YouTube URLs → Plain text
  // PDF: Use multimodal input (inline base64 + text)
  // Instagram: Scrape via Apify, then use file_data with media URLs
  // YouTube: Use file_data with file_uri for video content extraction
  // TXT/MD: Text is already included in the prompt above
  const buildContents = async (): Promise<string | { parts: any[] }> => {
    // Handle PDF documents (multimodal with inline data)
    if (document?.type === 'pdf' && document.base64) {
      return {
        parts: [
          {
            inlineData: {
              mimeType: document.mimeType,
              data: document.base64
            }
          },
          { text: prompt }
        ]
      };
    }

    // Handle Instagram URLs (scrape via Apify, download media, upload to Gemini Files API)
    const instagramUrls = extractInstagramUrls(effectiveTopic);
    if (instagramUrls.length > 0 && hasApifyApiKey()) {
      try {
        console.log('Fetching Instagram content...');
        const instagramData = await scrapeInstagramPost(instagramUrls[0]);
        const parts: any[] = [];

        // Handle Video (Reels) - download and upload to Gemini
        if (instagramData.type === 'Video' && instagramData.videoUrl) {
          try {
            console.log('Downloading Instagram video...');
            const videoBlob = await downloadMediaAsBlob(instagramData.videoUrl);
            console.log('Uploading video to Gemini Files API...');
            const uploaded = await uploadToGemini(videoBlob, `instagram_reel_${Date.now()}.mp4`);
            parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
          } catch (err) {
            console.warn('Failed to upload Instagram video:', err);
            // Will fall through to text-only if no media uploaded
          }
        }
        // Handle Images (carousel or single post) - download and upload each
        else if (instagramData.images?.length > 0) {
          console.log(`Downloading ${instagramData.images.length} Instagram images...`);
          // Limit to 10 images to stay under request size limits
          for (const imageUrl of instagramData.images.slice(0, 10)) {
            try {
              const imageBlob = await downloadMediaAsBlob(imageUrl);
              const uploaded = await uploadToGemini(imageBlob, `instagram_image_${Date.now()}.jpg`);
              parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
            } catch (err) {
              console.warn('Failed to upload Instagram image:', err);
              // Continue with other images
            }
          }
        }

        // Build enhanced prompt with Instagram caption
        const instagramContext = `\n\nSource: Instagram ${instagramData.type} by @${instagramData.ownerUsername}${instagramData.ownerFullName ? ` (${instagramData.ownerFullName})` : ''}:\nCaption: ${instagramData.caption || '(no caption)'}`;

        // Remove the Instagram URL from topic for cleaner prompt
        const topicWithoutUrl = effectiveTopic.replace(extractInstagramUrls(effectiveTopic)[0], '').trim();
        const additionalContext = topicWithoutUrl ? `\n\nAdditional context: ${topicWithoutUrl}` : '';

        parts.push({ text: prompt + instagramContext + additionalContext });

        // Only return multimodal if we have at least one media part
        if (parts.length > 1) {
          console.log('Using multimodal Instagram content');
          return { parts };
        }

        // Fallback to text-only with OCR data if media upload failed
        console.log('Using text-only Instagram content (media upload failed)');
        const textContent = formatInstagramContentForAI(instagramData);
        return prompt + '\n\n' + textContent + additionalContext;
      } catch (error) {
        console.warn('Failed to process Instagram, falling back to plain text:', error);
        // Fall through to try YouTube or plain text
      }
    }

    // Handle YouTube URLs (multimodal with file_uri)
    const youtubeUrls = extractYouTubeUrls(effectiveTopic);
    if (youtubeUrls.length > 0) {
      const parts: any[] = youtubeUrls.map(url => ({
        fileData: {
          fileUri: normalizeYouTubeUrl(url)
        }
      }));
      parts.push({ text: prompt });
      return { parts };
    }

    // Default: plain text prompt
    return prompt;
  };

  // Inner function to call the API with a specific model
  // Uses "structured output" (responseSchema) to guarantee JSON format
  const generate = async (m: string) => {
      const contents = await buildContents();
      const response = await ai.models.generateContent({
        model: m,
        contents,
        config: {
          // STRUCTURED OUTPUT: Forces Gemini to return valid JSON
          // matching our schema - no regex parsing needed
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              slides: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    content: { type: Type.STRING },
                    needsImage: { type: Type.BOOLEAN },
                    suggestedImagePrompt: { type: Type.STRING }
                  },
                  required: ["type", "content", "needsImage", "suggestedImagePrompt"]
                }
              }
            }
          }
        }
      });
      return response;
  };

  // Transform API response into app's Slide interface
  const parseResponse = (response: any) => {
      const json = JSON.parse(response.text || "{}");
      const rawSlides = (json.slides || []) as GeneratedSlideSchema[];

      return rawSlides.map((s, index) => ({
        id: crypto.randomUUID(),
        type: (s.type as SlideType) || SlideType.CONTENT,
        content: s.content,
        showImage: s.needsImage,
        imagePrompt: s.suggestedImagePrompt,
        imageUrl: undefined,  // Images are generated separately via generateSlideImage()
        imageScale: 50,       // Default: image takes 50% of slide height
        overlayImage: true    // Default: text overlays image (Storyteller mode)
      }));
  };

  try {
    const response = await generate(modelName);
    return parseResponse(response);
  } catch (error) {
    console.warn(`Error generating carousel content with ${modelName}:`, error);
    
    // Fallback Chain: Pro 3 -> Flash
    let fallbackModel: string | null = null;

    if (modelName === TEXT_MODEL_PRO) {
        fallbackModel = TEXT_MODEL_FLASH;
    }

    if (fallbackModel) {
        console.log(`Attempting fallback to ${fallbackModel}...`);
        try {
            return await generateCarouselContent(topic, count, fallbackModel, document);
        } catch (fallbackError) {
            // The recursive call will handle its own logging, but if it bubbles up:
            console.error(`Fallback chain failed at ${fallbackModel}:`, fallbackError);
            throw fallbackError;
        }
    }
    
    // If no fallback model defined (e.g. we failed on Flash), throw original error
    throw error;
  }
};

// ============================================================================
// CONTENT REFINEMENT
// ============================================================================

/**
 * Refines existing carousel content based on user feedback.
 *
 * Can operate in two modes:
 * 1. GLOBAL: Refine all slides at once (slideIndex = undefined)
 * 2. PER-SLIDE: Refine only a specific slide (slideIndex = number)
 *
 * @param slides - Current array of slides to refine
 * @param feedback - User's refinement instructions (e.g., "Translate to Spanish", "Make more technical")
 * @param slideIndex - Optional index of specific slide to refine (undefined = all slides)
 * @param modelName - Which model to use (defaults to Pro, falls back automatically)
 * @returns Updated array of Slide objects
 */
export const refineCarouselContent = async (
  slides: Slide[],
  feedback: string,
  slideIndex?: number,
  modelName: string = TEXT_MODEL_PRO
): Promise<Slide[]> => {
  const isGlobal = slideIndex === undefined;

  // Build current content representation for the AI
  const formatSlide = (s: Slide, i: number) =>
    `Slide ${i + 1} (${s.type}):\n${s.content}`;

  const currentContent = isGlobal
    ? slides.map((s, i) => formatSlide(s, i)).join('\n\n')
    : formatSlide(slides[slideIndex], slideIndex);

  // Build the refinement prompt
  const prompt = isGlobal
    ? `You are refining an Instagram carousel. Apply the following feedback to ALL slides while maintaining the AIDA framework and storytelling flow.

FEEDBACK: "${feedback}"

CURRENT CAROUSEL CONTENT:
${currentContent}

Requirements:
1. Apply the feedback consistently across all ${slides.length} slides
2. Maintain each slide's type (COVER, CONTENT, CTA)
3. Keep the same number of slides (${slides.length})
4. Preserve Markdown formatting (# headers, **bold**, etc.)
5. Keep suggestedImagePrompt relevant to the new content
6. PRESERVE THE AIDA STRUCTURE:
   - COVER slide must remain emotionally provocative and curiosity-inducing
   - Early CONTENT slides should build INTEREST with surprising insights
   - Later CONTENT slides should build DESIRE with transformation/benefits
   - CTA must connect to the desire built throughout
7. Maintain storytelling coherence - every slide should flow naturally into the next

Return strictly JSON with the refined slides.`
    : `You are refining a single slide from an Instagram carousel. Apply the following feedback to this specific slide only.

FEEDBACK: "${feedback}"

CURRENT SLIDE CONTENT:
${currentContent}

Requirements:
1. Apply the feedback to this slide
2. Maintain the slide type: ${slides[slideIndex].type}
3. Preserve Markdown formatting (# headers, **bold**, etc.)
4. Update suggestedImagePrompt if content changed significantly
5. Preserve the slide's role in the AIDA framework:
   - COVER: Keep it emotionally provocative and curiosity-inducing
   - CONTENT: Maintain its role in building Interest or Desire
   - CTA: Keep it action-oriented and connected to the overall narrative

Return strictly JSON with ONE refined slide.`;

  // Inner function to call the API
  const generate = async (m: string) => {
    const response = await ai.models.generateContent({
      model: m,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: isGlobal
          ? {
              // Schema for multiple slides (global refinement)
              type: Type.OBJECT,
              properties: {
                slides: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING },
                      content: { type: Type.STRING },
                      needsImage: { type: Type.BOOLEAN },
                      suggestedImagePrompt: { type: Type.STRING }
                    },
                    required: ["type", "content", "needsImage", "suggestedImagePrompt"]
                  }
                }
              }
            }
          : {
              // Schema for single slide (per-slide refinement)
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                content: { type: Type.STRING },
                needsImage: { type: Type.BOOLEAN },
                suggestedImagePrompt: { type: Type.STRING }
              },
              required: ["type", "content", "needsImage", "suggestedImagePrompt"]
            }
      }
    });
    return response;
  };

  // Parse the response and merge with existing slides
  const parseResponse = (response: any): Slide[] => {
    const json = JSON.parse(response.text || "{}");

    if (isGlobal) {
      // Global: Replace all slides content while preserving IDs and image URLs
      const refinedSlides = json.slides || [];
      return slides.map((original, i) => ({
        ...original,
        type: refinedSlides[i]?.type || original.type,
        content: refinedSlides[i]?.content || original.content,
        showImage: refinedSlides[i]?.needsImage ?? original.showImage,
        imagePrompt: refinedSlides[i]?.suggestedImagePrompt || original.imagePrompt
        // Preserve: id, imageUrl, imageScale, overlayImage, imageOffsetY, gradientHeight, fontStyle, fontScale
      }));
    } else {
      // Per-slide: Update only the specified slide
      return slides.map((original, i) => {
        if (i !== slideIndex) return original;
        return {
          ...original,
          type: json.type || original.type,
          content: json.content || original.content,
          showImage: json.needsImage ?? original.showImage,
          imagePrompt: json.suggestedImagePrompt || original.imagePrompt
        };
      });
    }
  };

  try {
    const response = await generate(modelName);
    return parseResponse(response);
  } catch (error) {
    console.warn(`Error refining content with ${modelName}:`, error);

    // Same fallback chain as generateCarouselContent: Pro 3 -> Flash
    let fallbackModel: string | null = null;
    if (modelName === TEXT_MODEL_PRO) {
      fallbackModel = TEXT_MODEL_FLASH;
    }

    if (fallbackModel) {
      console.log(`Attempting fallback to ${fallbackModel}...`);
      return await refineCarouselContent(slides, feedback, slideIndex, fallbackModel);
    }

    throw error;
  }
};

// ============================================================================
// IMAGE GENERATION
// ============================================================================

/**
 * Generates an image from a text prompt using Gemini's image generation API.
 *
 * @param prompt - Description of the image to generate
 * @param aspectRatio - Desired aspect ratio (converted to API format internally)
 * @param modelName - Which model to use (Pro for 2K quality, Flash for broader access)
 * @returns Base64 data URI of the generated image (ready for <img src="">)
 *
 * FALLBACK STRATEGY (permission-based only):
 * Pro → Flash (only triggers on 403 permission errors, not other failures)
 * This is different from text generation which falls back on ANY error.
 *
 * PROMPT ENHANCEMENT:
 * All prompts are prefixed with a global style (defaults to "Minimalist, high quality, photorealistic, cinematic lighting.")
 * The style can be customized by the user in the Workspace settings.
 */
export const DEFAULT_IMAGE_STYLE = 'Minimalist, high quality, photorealistic, cinematic lighting.';

export const generateSlideImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  modelName: string = IMAGE_MODEL_PRO,
  globalStyle: string = DEFAULT_IMAGE_STYLE
): Promise<string> => {
  const apiAspectRatio = getApiAspectRatio(aspectRatio);

  // Use the provided global style, or fall back to default if empty
  const stylePrefix = globalStyle.trim() || DEFAULT_IMAGE_STYLE;

  const generate = async (m: string) => {
      const isPro = m === IMAGE_MODEL_PRO;
      const response = await ai.models.generateContent({
        model: m,
        contents: {
          // Enhance all prompts with the global style prefix
          parts: [{ text: `${stylePrefix} ${prompt}` }]
        },
        config: {
          imageConfig: {
            aspectRatio: apiAspectRatio,
            // Pro model supports 2K resolution; Flash doesn't support imageSize
            ...(isPro ? { imageSize: "2K" } : {})
          }
        }
      });
      return response;
  }

  try {
    const response = await generate(modelName);
    return extractImage(response);
  } catch (error: any) {
    // PERMISSION-BASED FALLBACK: Only fall back on 403 errors
    // Other errors (rate limits, network issues) should bubble up immediately
    if (modelName === IMAGE_MODEL_PRO && (error?.status === 'PERMISSION_DENIED' || error?.status === 403 || error.message?.includes('403'))) {
       console.warn(`Falling back to ${IMAGE_MODEL_FLASH} due to permission error on ${IMAGE_MODEL_PRO}`);
       try {
           const response = await generate(IMAGE_MODEL_FLASH);
           return extractImage(response);
       } catch (fallbackError) {
           console.error("Fallback image generation also failed:", fallbackError);
           throw fallbackError;
       }
    }
    console.error("Error generating image:", error);
    throw error;
  }
};

/**
 * Extracts the base64 image data from a Gemini API response.
 *
 * Gemini returns a nested structure: response.candidates[0].content.parts[]
 * We look for a part with inlineData.data and wrap it as a data URI.
 *
 * @throws Error if no image data found in response
 */
const extractImage = (response: any): string => {
   for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from API");
}

// ============================================================================
// IMAGE STYLIZATION (Image-to-Image)
// ============================================================================

/**
 * Transforms an uploaded image using Gemini's image-to-image capability.
 *
 * This is different from generateSlideImage() - instead of generating from text,
 * it takes an existing image and applies a style transformation while preserving
 * the core subject matter.
 *
 * HOW IT WORKS:
 * 1. User uploads an image (converted to base64)
 * 2. User provides a style prompt (e.g., "watercolor painting", "cyberpunk style")
 * 3. Gemini regenerates the image with the requested style applied
 *
 * @param imageBase64 - Raw base64 data (NOT a data URI - no "data:image/..." prefix)
 * @param mimeType - Image MIME type (e.g., "image/png", "image/jpeg")
 * @param stylePrompt - Description of desired transformation
 * @param apiAspectRatio - Already in API format (e.g., "1:1") - preserves original ratio
 * @param modelName - Model to use (Pro for 2K, Flash for fallback)
 * @returns Base64 data URI of the stylized image
 */
export const stylizeImage = async (
  imageBase64: string,
  mimeType: string,
  stylePrompt: string,
  apiAspectRatio: string,
  modelName: string = IMAGE_MODEL_PRO
): Promise<string> => {

  const generate = async (m: string) => {
    const isPro = m === IMAGE_MODEL_PRO;
    const response = await ai.models.generateContent({
      model: m,
      contents: {
        // IMAGE-TO-IMAGE: Send both the source image and transformation prompt
        parts: [
          {
            // Source image as inline data (base64)
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          },
          {
            // Transformation instructions
            text: `Transform this image with the following style: ${stylePrompt}. Maintain the core subject matter but apply the artistic transformation.`
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: apiAspectRatio,
          ...(isPro ? { imageSize: "2K" } : {})
        }
      }
    });
    return response;
  };

  try {
    const response = await generate(modelName);
    return extractImage(response);
  } catch (error: any) {
    // Same permission-based fallback as generateSlideImage
    if (modelName === IMAGE_MODEL_PRO && (error?.status === 'PERMISSION_DENIED' || error?.status === 403 || error.message?.includes('403'))) {
      console.warn(`Falling back to ${IMAGE_MODEL_FLASH} for stylization`);
      try {
        const response = await generate(IMAGE_MODEL_FLASH);
        return extractImage(response);
      } catch (fallbackError) {
        console.error("Fallback stylization also failed:", fallbackError);
        throw fallbackError;
      }
    }
    console.error("Error stylizing image:", error);
    throw error;
  }
};

// ============================================================================
// IMAGE EDITING
// ============================================================================

/**
 * Edits an existing image using AI based on a text prompt.
 *
 * Similar to stylizeImage but with editing-focused instructions.
 * Use this for modifications like "add rain", "make it nighttime",
 * "remove the person", etc.
 *
 * @param imageBase64 - Raw base64 data (NOT a data URI - no "data:image/..." prefix)
 * @param mimeType - Image MIME type (e.g., "image/png", "image/jpeg")
 * @param editPrompt - Description of desired changes (e.g., "add rain", "make it darker")
 * @param apiAspectRatio - Already in API format (e.g., "1:1")
 * @param modelName - Model to use (Pro for 2K, Flash for fallback)
 * @returns Base64 data URI of the edited image
 */
export const editImage = async (
  imageBase64: string,
  mimeType: string,
  editPrompt: string,
  apiAspectRatio: string,
  modelName: string = IMAGE_MODEL_PRO
): Promise<string> => {

  const generate = async (m: string) => {
    const isPro = m === IMAGE_MODEL_PRO;
    const response = await ai.models.generateContent({
      model: m,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          },
          {
            text: `Edit this image according to the following instructions: ${editPrompt}. Keep the main subject and composition, but apply the requested changes.`
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: apiAspectRatio,
          ...(isPro ? { imageSize: "2K" } : {})
        }
      }
    });
    return response;
  };

  try {
    const response = await generate(modelName);
    return extractImage(response);
  } catch (error: any) {
    // Same permission-based fallback as generateSlideImage
    if (modelName === IMAGE_MODEL_PRO && (error?.status === 'PERMISSION_DENIED' || error?.status === 403 || error.message?.includes('403'))) {
      console.warn(`Falling back to ${IMAGE_MODEL_FLASH} for image editing`);
      try {
        const response = await generate(IMAGE_MODEL_FLASH);
        return extractImage(response);
      } catch (fallbackError) {
        console.error("Fallback image editing also failed:", fallbackError);
        throw fallbackError;
      }
    }
    console.error("Error editing image:", error);
    throw error;
  }
};
