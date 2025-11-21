-- Create sources table for scraper sources
CREATE TABLE IF NOT EXISTS public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default sources
INSERT INTO public.sources (name, base_url, code) VALUES
  ('Manhwalist', 'https://manhwalist02.site/', 'MANHWALIST'),
  ('Shinigami', 'https://08.shinigami.asia/', 'SHINIGAMI'),
  ('Komikcast', 'https://komikcast03.com/', 'KOMIKCAST')
ON CONFLICT (code) DO NOTHING;

-- Add columns to komik table
ALTER TABLE public.komik
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.sources(id),
  ADD COLUMN IF NOT EXISTS source_slug TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add columns to chapters table
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS source_chapter_id TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Create chapter_pages table for page caching
CREATE TABLE IF NOT EXISTS public.chapter_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  source_image_url TEXT NOT NULL,
  cached_image_url TEXT,
  cached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (chapter_id, page_number)
);

-- Create scrape_logs table for debugging
CREATE TABLE IF NOT EXISTS public.scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sources(id),
  target_url TEXT,
  action TEXT,
  status TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_chapter_pages_chapter_id ON public.chapter_pages(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_pages_cached_at ON public.chapter_pages(cached_at);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_created_at ON public.scrape_logs(created_at);

-- Enable RLS on new tables
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sources
CREATE POLICY "Anyone can view sources" ON public.sources
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage sources" ON public.sources
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for chapter_pages
CREATE POLICY "Anyone can view chapter pages" ON public.chapter_pages
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage chapter pages" ON public.chapter_pages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for scrape_logs
CREATE POLICY "Admins can view scrape logs" ON public.scrape_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can insert scrape logs" ON public.scrape_logs
  FOR INSERT WITH CHECK (true);