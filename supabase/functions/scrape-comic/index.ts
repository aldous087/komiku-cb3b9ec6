import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RemoteChapterPage {
  pageNumber: number;
  imageUrl: string;
}

// Simple rate limiter
const lastRequestTime: Record<string, number> = {};
const MIN_DELAY_MS = 2000;

async function safeFetch(url: string): Promise<string> {
  const hostname = new URL(url).hostname;
  const now = Date.now();
  const lastTime = lastRequestTime[hostname] || 0;
  const timeSinceLastRequest = now - lastTime;
  
  if (timeSinceLastRequest < MIN_DELAY_MS) {
    const delay = MIN_DELAY_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  lastRequestTime[hostname] = Date.now();
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

function extractChapterNumber(text: string): number {
  const patterns = [
    /chapter[:\s-]*(\d+\.?\d*)/i,
    /ch\.?\s*(\d+\.?\d*)/i,
    /(\d+\.?\d*)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
  }
  return 0;
}

async function scrapeChapterPages(sourceCode: string, chapterUrl: string): Promise<RemoteChapterPage[]> {
  console.log(`Scraping chapter pages from ${sourceCode}: ${chapterUrl}`);
  
  const html = await safeFetch(chapterUrl);
  const $ = cheerio.load(html);
  const pages: RemoteChapterPage[] = [];

  if (sourceCode === 'MANHWALIST') {
    $('#readerarea img, .reader-area img, .chapter-content img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.includes('logo') && !src.includes('icon')) {
        pages.push({ pageNumber: i + 1, imageUrl: src });
      }
    });
  } else if (sourceCode === 'SHINIGAMI') {
    $('#readerarea img, .reader-area img, .chapter-images img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.includes('logo') && !src.includes('icon')) {
        pages.push({ pageNumber: i + 1, imageUrl: src });
      }
    });
  } else if (sourceCode === 'KOMIKCAST') {
    $('#chapter_body img, .main-reading-area img, .chapter-area img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.includes('logo') && !src.includes('icon')) {
        pages.push({ pageNumber: i + 1, imageUrl: src });
      }
    });
  }

  return pages;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { chapterId } = await req.json();

    if (!chapterId) {
      throw new Error('chapterId is required');
    }

    console.log(`Processing chapter ${chapterId}`);

    // Get chapter with source info
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select(`
        *,
        komik:komik_id (
          id,
          title,
          source_id,
          source_url,
          sources:source_id (
            id,
            code,
            base_url
          )
        )
      `)
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      throw new Error('Chapter not found');
    }

    const komik = chapter.komik as any;
    const source = komik?.sources as any;

    if (!source || !chapter.source_url) {
      throw new Error('Chapter source not configured');
    }

    // Check cache (24 hours TTL)
    const { data: cachedPages } = await supabase
      .from('chapter_pages')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('page_number');

    if (cachedPages && cachedPages.length > 0) {
      const cacheAge = cachedPages[0].cached_at 
        ? Date.now() - new Date(cachedPages[0].cached_at).getTime()
        : Infinity;
      
      // If cache is less than 24 hours old, return it
      if (cacheAge < 24 * 60 * 60 * 1000) {
        console.log('Returning cached pages');
        return new Response(
          JSON.stringify({
            chapterId,
            cached: true,
            pages: cachedPages.map(p => ({
              pageNumber: p.page_number,
              imageUrl: p.source_image_url,
            })),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Scrape fresh pages
    console.log('Scraping fresh pages');
    const pages = await scrapeChapterPages(source.code, chapter.source_url);

    if (pages.length === 0) {
      throw new Error('No pages found');
    }

    // Delete old cache
    await supabase
      .from('chapter_pages')
      .delete()
      .eq('chapter_id', chapterId);

    // Insert new pages
    const { error: insertError } = await supabase
      .from('chapter_pages')
      .insert(
        pages.map(p => ({
          chapter_id: chapterId,
          page_number: p.pageNumber,
          source_image_url: p.imageUrl,
          cached_at: new Date().toISOString(),
        }))
      );

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
    }

    // Log success
    await supabase.from('scrape_logs').insert({
      source_id: source.id,
      target_url: chapter.source_url,
      action: 'FETCH_CHAPTER',
      status: 'SUCCESS',
    });

    return new Response(
      JSON.stringify({
        chapterId,
        cached: false,
        pages: pages.map(p => ({
          pageNumber: p.pageNumber,
          imageUrl: p.imageUrl,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
