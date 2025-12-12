/**
 * Instagram Service
 *
 * Handles Instagram post/reel scraping via Apify REST API and API key management.
 * Used to fetch content from Instagram URLs for carousel generation.
 *
 * Note: Uses Apify REST API directly (not npm client) for browser compatibility.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface InstagramPostData {
  type: 'Sidecar' | 'Video' | 'Image';
  caption: string;
  images: string[];
  videoUrl?: string;
  ownerUsername: string;
  ownerFullName: string;
  childPosts?: Array<{ alt: string; displayUrl: string }>;
}

// ============================================================================
// URL DETECTION
// ============================================================================

/**
 * Regex to match Instagram post/reel URLs
 * Supports:
 * - instagram.com/p/XXXXX (posts)
 * - instagram.com/reel/XXXXX (reels)
 * - instagram.com/reels/XXXXX (reels alternate)
 * - With or without https://, www., query params
 */
export const INSTAGRAM_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels)\/[a-zA-Z0-9_-]+/g;

/**
 * Extract Instagram URLs from text
 */
export const extractInstagramUrls = (text: string): string[] => {
  const matches = text.match(INSTAGRAM_URL_REGEX);
  return matches || [];
};

/**
 * Normalize Instagram URL to ensure https:// prefix
 */
export const normalizeInstagramUrl = (url: string): string => {
  if (!url.startsWith('http')) {
    return `https://${url}`;
  }
  return url;
};

// ============================================================================
// APIFY API KEY MANAGEMENT
// ============================================================================

const APIFY_KEY_STORAGE = 'apify_api_key';

export const setApifyApiKey = (key: string): void => {
  localStorage.setItem(APIFY_KEY_STORAGE, key);
};

export const getApifyApiKey = (): string => {
  return localStorage.getItem(APIFY_KEY_STORAGE) || '';
};

export const hasApifyApiKey = (): boolean => {
  return !!getApifyApiKey();
};

export const getApifyApiKeyMasked = (): string => {
  const key = getApifyApiKey();
  if (!key) return '';
  if (key.length <= 12) return '****';
  return key.slice(0, 8) + '...' + key.slice(-4);
};

// ============================================================================
// APIFY SCRAPING (REST API - browser compatible)
// ============================================================================

const APIFY_ACTOR_ID = 'nH2AHrwxeTRJoN5hX'; // Instagram Post Scraper
const APIFY_API_BASE = 'https://api.apify.com/v2';

/**
 * Scrape Instagram post/reel data using Apify REST API
 *
 * @param url - Instagram post or reel URL
 * @param apiToken - Apify API token (optional, uses stored key if not provided)
 * @returns Scraped post data including caption, images, video URL
 */
export const scrapeInstagramPost = async (
  url: string,
  apiToken?: string
): Promise<InstagramPostData> => {
  const token = apiToken || getApifyApiKey();

  if (!token) {
    throw new Error('Apify API key is required for Instagram scraping');
  }

  const normalizedUrl = normalizeInstagramUrl(url);

  try {
    // Step 1: Start the actor run
    const runResponse = await fetch(
      `${APIFY_API_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: [normalizedUrl],
          resultsLimit: 1,
        }),
      }
    );

    if (!runResponse.ok) {
      if (runResponse.status === 401) {
        throw new Error('Invalid Apify API key. Please check your token.');
      }
      if (runResponse.status === 429) {
        throw new Error('Apify rate limit reached. Please try again later.');
      }
      throw new Error(`Apify API error: ${runResponse.status}`);
    }

    const runData = await runResponse.json();
    const runId = runData.data?.id;

    if (!runId) {
      throw new Error('Failed to start Apify actor run');
    }

    // Step 2: Wait for the run to complete (poll status)
    let status = runData.data?.status;
    let attempts = 0;
    const maxAttempts = 60; // Max 60 seconds (polling every 1s)

    while (status !== 'SUCCEEDED' && status !== 'FAILED' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await fetch(
        `${APIFY_API_BASE}/actor-runs/${runId}?token=${token}`
      );
      const statusData = await statusResponse.json();
      status = statusData.data?.status;
      attempts++;
    }

    if (status === 'FAILED') {
      throw new Error('Instagram scraping failed. The post may be private or unavailable.');
    }

    if (status !== 'SUCCEEDED') {
      throw new Error('Instagram scraping timed out. Please try again.');
    }

    // Step 3: Fetch results from the dataset
    const datasetId = runData.data?.defaultDatasetId;
    const datasetResponse = await fetch(
      `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token}`
    );
    const items = await datasetResponse.json();

    if (!items || items.length === 0) {
      throw new Error('No Instagram data found. The post may be private or unavailable.');
    }

    const post = items[0] as any;

    return {
      type: post.type || 'Image',
      caption: post.caption || '',
      images: post.images || [],
      videoUrl: post.videoUrl,
      ownerUsername: post.ownerUsername || 'unknown',
      ownerFullName: post.ownerFullName || '',
      childPosts: post.childPosts,
    };
  } catch (error: any) {
    if (error.message?.includes('Invalid Apify') || error.message?.includes('rate limit')) {
      throw error;
    }
    throw new Error(`Failed to scrape Instagram: ${error.message}`);
  }
};

// ============================================================================
// MEDIA DOWNLOAD
// ============================================================================

/**
 * Downloads media from URL and returns as Blob
 * Works in browser using fetch
 * Used to download Instagram images/videos for upload to Gemini Files API
 */
export const downloadMediaAsBlob = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }
  return await response.blob();
};

// ============================================================================
// TEXT FORMATTING
// ============================================================================

/**
 * Format Instagram content for AI prompt (fallback text-only mode)
 */
export const formatInstagramContentForAI = (data: InstagramPostData): string => {
  let content = `Instagram ${data.type} by @${data.ownerUsername}`;
  if (data.ownerFullName) {
    content += ` (${data.ownerFullName})`;
  }
  content += `:\n\n`;

  if (data.caption) {
    content += `Caption:\n${data.caption}\n\n`;
  }

  // Include OCR text from carousel slides if available
  if (data.childPosts?.length) {
    const slidesWithAlt = data.childPosts.filter(post => post.alt);
    if (slidesWithAlt.length > 0) {
      content += `Slide contents (text from images):\n`;
      slidesWithAlt.forEach((post, i) => {
        content += `Slide ${i + 1}: ${post.alt}\n`;
      });
    }
  }

  return content;
};
