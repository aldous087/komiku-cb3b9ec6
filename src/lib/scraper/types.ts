export interface ScraperSourceConfig {
  code: 'MANHWALIST' | 'SHINIGAMI' | 'KOMIKCAST';
  baseUrl: string;
}

export interface RemoteComicSummary {
  sourceCode: string;
  sourceSlug: string;
  sourceUrl: string;
  title: string;
  coverUrl?: string;
  description?: string;
  genres?: string[];
  status?: string;
  author?: string;
}

export interface RemoteChapterSummary {
  sourceChapterId: string;
  sourceUrl: string;
  chapterNumber: number;
  title?: string;
  createdAt?: Date;
}

export interface RemoteChapterPage {
  pageNumber: number;
  imageUrl: string;
}

export interface ScraperAdapter {
  fetchComicDetail(sourceComicUrl: string): Promise<{
    comic: RemoteComicSummary;
    chapters: RemoteChapterSummary[];
  }>;
  fetchChapterPages(chapterUrl: string): Promise<RemoteChapterPage[]>;
}
