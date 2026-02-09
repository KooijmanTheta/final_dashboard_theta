import { NextResponse } from 'next/server';

export const revalidate = 300;

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author: string | null;
  image: string | null;
  source: string;
}

const FEEDS = [
  { url: 'https://multicoin.capital/rss.xml', source: 'Multicoin Capital' },
  { url: 'https://thedefiant.io/api/feed', source: 'The Defiant' },
  { url: 'https://www.bankless.com/rss/feed', source: 'Bankless' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt' },
];

function extractTag(xml: string, tag: string): string | null {
  // CDATA wrapped
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`,
    'i'
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text
  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const plainMatch = xml.match(plainRegex);
  if (plainMatch) return plainMatch[1].trim();

  return null;
}

function extractImage(xml: string): string | null {
  // media:content url (Bankless)
  let match = xml.match(/<media:content[^>]+url="([^"]+)"/i);
  if (match) return match[1];

  // media:thumbnail url (Defiant, Decrypt)
  match = xml.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
  if (match) return match[1];

  // enclosure with image type
  const enclosureMatch = xml.match(/<enclosure[^>]+>/i);
  if (enclosureMatch) {
    const enc = enclosureMatch[0];
    const urlMatch = enc.match(/url="([^"]+)"/i);
    if (urlMatch) {
      const typeMatch = enc.match(/type="([^"]+)"/i);
      if (!typeMatch || typeMatch[1].startsWith('image') || typeMatch[1] === 'null') {
        return urlMatch[1];
      }
    }
  }

  // img tag (Defiant custom)
  match = xml.match(/<img[^>]+src="([^"]+)"/i);
  if (match) return match[1];

  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRSSItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const author = extractTag(itemXml, 'dc:creator');
    const rawDesc = extractTag(itemXml, 'description') || '';
    const description = stripHtml(rawDesc).slice(0, 200);
    const image = extractImage(itemXml);

    if (title && link) {
      items.push({ title: stripHtml(title), link, description, pubDate: pubDate || '', author, image, source });
    }
  }

  return items;
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const xml = await res.text();
    return parseRSSItems(xml, source);
  } catch (error) {
    console.error(`Error fetching ${source}:`, error);
    return [];
  }
}

export async function GET() {
  try {
    const results = await Promise.all(
      FEEDS.map((feed) => fetchFeed(feed.url, feed.source))
    );

    const allItems = results
      .flat()
      .sort((a, b) => {
        const dateA = new Date(a.pubDate).getTime() || 0;
        const dateB = new Date(b.pubDate).getTime() || 0;
        return dateB - dateA;
      })
      .slice(0, 12);

    return NextResponse.json(allItems);
  } catch (error) {
    console.error('Error aggregating news:', error);
    return NextResponse.json([]);
  }
}
