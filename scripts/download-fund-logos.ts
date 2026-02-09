/**
 * Download fund manager logos from Airtable and save to public/logos/
 *
 * Usage: npx tsx scripts/download-fund-logos.ts
 *
 * Requires .env.local with:
 *   AIRTABLE_API_KEY
 *   AIRTABLE_MONITORING_BASE_ID
 *   AIRTABLE_FUND_UNIVERSE_TABLE_ID
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../.env.local') });

const API_KEY = process.env.AIRTABLE_API_KEY!;
const BASE_ID = process.env.AIRTABLE_MONITORING_BASE_ID!;
const TABLE_ID = process.env.AIRTABLE_FUND_UNIVERSE_TABLE_ID!;
const LOGOS_DIR = path.resolve(__dirname, '../public/logos');

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (reqUrl: string) => {
      https.get(reqUrl, { headers: {} }, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) {
            request(location);
            return;
          }
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode} for ${reqUrl}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    };
    request(url);
  });
}

interface AirtableRecord {
  id: string;
  fields: {
    fund_id?: string;
    logo?: Array<{
      url: string;
      filename: string;
      type: string;
    }>;
  };
}

async function fetchAllRecords(): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('fields[]', 'fund_id');
    url.searchParams.append('fields[]', 'logo');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable API ${res.status}: ${text}`);
    }

    const data = await res.json();
    all.push(...data.records);
    offset = data.offset;
  } while (offset);

  return all;
}

async function main() {
  if (!API_KEY || !BASE_ID || !TABLE_ID) {
    console.error('Missing Airtable env vars');
    process.exit(1);
  }

  if (!fs.existsSync(LOGOS_DIR)) {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
  }

  console.log('Fetching fund universe from Airtable...');
  const records = await fetchAllRecords();
  console.log(`Found ${records.length} records`);

  const mapping: Record<string, string> = {};
  let downloaded = 0;
  let skipped = 0;

  for (const record of records) {
    const fundId = record.fields.fund_id;
    const logo = record.fields.logo;

    if (!fundId || !logo || logo.length === 0) {
      skipped++;
      continue;
    }

    const logoUrl = logo[0].url;
    let ext = logo[0].type?.split('/')[1] || 'png';
    if (ext === 'svg+xml') ext = 'svg';
    const slug = slugify(fundId.trim());
    const filename = `${slug}.${ext}`;
    const destPath = path.join(LOGOS_DIR, filename);

    // Skip if already downloaded
    if (fs.existsSync(destPath)) {
      mapping[fundId] = `/logos/${filename}`;
      console.log(`  [skip] ${fundId} (already exists)`);
      skipped++;
      continue;
    }

    try {
      await downloadFile(logoUrl, destPath);
      mapping[fundId] = `/logos/${filename}`;
      downloaded++;
      console.log(`  [ok]   ${fundId} -> ${filename}`);
    } catch (err: any) {
      console.log(`  [fail] ${fundId}: ${err.message}`);
      skipped++;
    }
  }

  // Write mapping JSON so the app can look up fund_id -> local path
  const mappingPath = path.join(LOGOS_DIR, '_mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped`);
  console.log(`Mapping written to public/logos/_mapping.json (${Object.keys(mapping).length} entries)`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
