import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { EventResponse } from './types/event';

// --- Copied Cleaning Logic to make the script self-contained ---

function cleanSFRName(eventName: string): string {
  let name = eventName.trim();
  const prefixesToRemove = [
    /^Live Music:\s*/i,
    /^Concert:\s*/i,
    /^Music:\s*/i,
    /^Performance by\s*/i,
    /^featuring\s*/i,
    /^Featuring\s*/i,
    /^TGIF Music Series:\s*/i,
    /^Summer Sunday ft\s*/i,
    /^Boxcar Live Presents:\s*/i,
    /^Mama Mañana Showcase:\s*/i,
  ];
  for (const prefix of prefixesToRemove) {
    name = name.replace(prefix, '');
  }
  name = name.replace(/\s*\([^)]*\)/g, '');
  name = name.replace(/\s*at\s+.*$/i, '');
  return name.trim();
}

function cleanSongkickName(artistName: string): string {
  let result = artistName.trim();
  result = result.replace(/Concert Tickets.*$/, '').trim();
  result = result.replace(/^and /i, '').trim();

  const nonArtistPatterns = [
    /^\d+$/,
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i,
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i,
    /^From\b/i,
    /^[0-9]+ Upcoming/i,
    /Santa Fe/i,
    /^Tourbox/i,
    /^Popular/i,
    /^Get your/i,
    /^Filter/i,
    /^Support/i,
    /^Log in/i,
    /^Sign up/i,
    /^Language/i,
    /^Search/i,
    /^Home/i
  ];

  for (const pattern of nonArtistPatterns) {
    if (pattern.test(result)) {
      return '';
    }
  }
  return result;
}

function isArtist(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (!lower) return false;
  const blacklistPatterns = [
    /open mic/i,
    /karaoke/i,
    /singles mingle/i,
    /listening party/i,
    /family-friendly rave/i,
    /season finale/i,
    /music series/i,
    /summer scene/i,
    /summer sundaze/i,
    /summer series/i,
    /pride concert/i,
    /father's day concert/i,
    /songwriters? circle/i,
    /songwriters? showcase/i,
  ];
  for (const pattern of blacklistPatterns) {
    if (pattern.test(lower)) {
      return false;
    }
  }
  return true;
}

function cleanUpdaterName(artist: string): string {
  if (!isArtist(artist)) {
    return '';
  }
  const prefixesToRemove = [
    'Lensic 360 Presents: ',
    'Aprés Music Series: ',
    'Patio Music Series: ',
    'Santa Fe Summer Scene: ',
    'An Evening with... ',
    'TGIF Music Series: ',
    'Summer Sunday ft ',
    'Boxcar Live Presents: ',
    'Mama Mañana Showcase: ',
  ];
  let cleanedArtist = artist.trim();
  for (const prefix of prefixesToRemove) {
    if (cleanedArtist.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleanedArtist = cleanedArtist.slice(prefix.length).trim();
      break;
    }
  }
  return cleanedArtist;
}

// --- Fetching Logic ---

async function fetchSFRRaw(): Promise<{ raw: string; cleaned: string }[]> {
  const url = 'https://calendar.sfreporter.com/santa-fe-reporter/search.json';
  try {
    const firstPageResponse = await axios.get<EventResponse>(`${url}?page=1&ongoing=true`);
    const totalPages = firstPageResponse.data.pages;
    const events = [...firstPageResponse.data.events];

    if (totalPages > 1) {
      for (let page = 2; page <= totalPages; page++) {
        try {
          const res = await axios.get<EventResponse>(`${url}?page=${page}&ongoing=true`);
          events.push(...res.data.events);
        } catch (err: any) {
          console.error(`Error fetching SFR page ${page}:`, err.message);
        }
      }
    }

    // Filter for Music events
    const musicEvents = events.filter(event => 
      event._source.categories.some(category => category.name === "Music")
    );

    return musicEvents.map(event => {
      const raw = event._source.name;
      const stage1 = cleanSFRName(raw);
      const stage2 = cleanUpdaterName(stage1);
      return { raw, cleaned: stage2 };
    });
  } catch (error: any) {
    console.error('Error fetching SFR events:', error.message);
    return [];
  }
}

async function fetchSongkickRaw(): Promise<{ raw: string; cleaned: string }[]> {
  const url = 'https://www.songkick.com/metro-areas/90736-us-santa-fe';
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);
    const results: { raw: string; cleaned: string }[] = [];

    $('li.event-listings-element').each((_, element) => {
      const headliner = $(element).find('p.artists strong').text().trim();
      if (headliner) {
        const headliners = headliner.split(', ');
        headliners.forEach(artist => {
          if (artist.trim()) {
            const raw = artist.trim();
            const stage1 = cleanSongkickName(raw);
            const stage2 = cleanUpdaterName(stage1);
            results.push({ raw, cleaned: stage2 });
          }
        });
      }

      $(element).find('p.artists .support').each((_, supportElement) => {
        const supportText = $(supportElement).text().trim();
        if (supportText) {
          const raw = supportText;
          const stage1 = cleanSongkickName(raw);
          const stage2 = cleanUpdaterName(stage1);
          results.push({ raw, cleaned: stage2 });
        }
      });
    });

    return results;
  } catch (error: any) {
    console.error('Error fetching Songkick events:', error.message);
    return [];
  }
}

async function run() {
  console.log('Fetching raw events from Santa Fe Reporter and Songkick...');
  
  const sfrData = await fetchSFRRaw();
  console.log(`Fetched ${sfrData.length} music events from Santa Fe Reporter.`);
  
  const skData = await fetchSongkickRaw();
  console.log(`Fetched ${skData.length} events from Songkick.`);

  let markdown = `# Upcoming Concerts Parsing Comparison\n\n`;
  markdown += `Generated on: ${new Date().toISOString()}\n\n`;
  markdown += `This file lists all upcoming concert/event titles fetched from our active sources, showing both the raw name and the currently parsed artist name after all cleaning stages.\n\n`;

  markdown += `## Santa Fe Reporter\n\n`;
  markdown += `| Raw Event Name | Currently Parsed Artist Name |\n`;
  markdown += `| :--- | :--- |\n`;
  sfrData.forEach(item => {
    markdown += `| \`${item.raw}\` | **${item.cleaned || '*(filtered out)*'}** |\n`;
  });

  markdown += `\n## Songkick\n\n`;
  markdown += `| Raw Artist / Event Name | Currently Parsed Artist Name |\n`;
  markdown += `| :--- | :--- |\n`;
  skData.forEach(item => {
    markdown += `| \`${item.raw}\` | **${item.cleaned || '*(filtered out)*'}** |\n`;
  });

  const outputPath = path.join(process.cwd(), 'upcoming_concerts_comparison.md');
  fs.writeFileSync(outputPath, markdown);
  
  console.log(`\nComparison report generated successfully: ${outputPath}`);
}

run();
