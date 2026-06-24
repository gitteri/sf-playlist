import axios from 'axios';
import * as cheerio from 'cheerio';
import { Concert } from '../types/concert';

export class Lensic360Service {
  private urls = [
    'https://lensic360.org/tag/The%20Railyard',
    'https://lensic360.org/tag/Santa%20Fe'
  ];

  /**
   * Fetch upcoming concerts from Lensic 360 tag pages
   * @returns Array of Concert objects
   */
  async fetchConcerts(): Promise<Concert[]> {
    const concertsMap = new Map<string, Concert>();
    const monthsMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    // Use current year and month for relative year parsing
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed

    for (const url of this.urls) {
      try {
        console.log(`Fetching events from Lensic 360: ${url}`);
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 15000
        });

        const $ = cheerio.load(response.data);

        $('div.event_modal').each((i, elem) => {
          const id = $(elem).attr('id')?.replace('event_', '');
          if (!id) return;

          const h3 = $(elem).find('h3');
          if (h3.length === 0) return;

          // Extract venue and artist
          const venueText = h3.find('span').text().replace('@', '').trim();
          const h3Clone = h3.clone();
          h3Clone.find('span').remove();
          const rawArtistText = h3Clone.text().trim();

          const artistText = this.cleanArtistName(rawArtistText);
          if (!artistText) return;

          // Parse date
          const monthStr = $(elem).find('.modal-month').text().trim();
          const dayStr = $(elem).find('.modal-date').text().trim();
          const timeStr = $(elem).find('.modal-time').text().trim();

          const monthLower = monthStr.toLowerCase().substring(0, 3);
          const monthIndex = monthsMap[monthLower];

          let date = new Date();
          if (monthIndex !== undefined && dayStr) {
            let year = currentYear;
            if (monthIndex < currentMonth) {
              year = currentYear + 1;
            }
            const day = parseInt(dayStr, 10);
            let hour = 19; // default 7pm
            let minute = 0;
            if (timeStr) {
              const timeMatch = timeStr.match(/(\d+):(\d+)\s*(am|pm)/i);
              if (timeMatch) {
                hour = parseInt(timeMatch[1], 10);
                minute = parseInt(timeMatch[2], 10);
                const ampm = timeMatch[3].toLowerCase();
                if (ampm === 'pm' && hour < 12) {
                  hour += 12;
                } else if (ampm === 'am' && hour === 12) {
                  hour = 0;
                }
              }
            }
            date = new Date(year, monthIndex, day, hour, minute);
          }

          // URLs
          const listingUrl = $(elem).find('a:contains("MORE DETAILS")').attr('href') || 
                            $(elem).find('a:contains("EVENT PAGE")').attr('href');
          const fullListingUrl = listingUrl ? (listingUrl.startsWith('http') ? listingUrl : `https://lensic360.org${listingUrl}`) : `https://lensic360.org/tag/Summer%20Scene`;

          const ticketUrl = $(elem).find('a:contains("BUY TICKETS")').attr('href') || 
                           $(elem).find('a:contains("BUY")').attr('href') || 
                           fullListingUrl;

          // Extract openers / description
          const subH6 = $(elem).find('.modal-body > h6').first();
          const subArtistText = subH6.length > 0 ? subH6.text().trim() : '';
          const description = subArtistText ? `Opener: ${subArtistText}` : undefined;

          // Push the main artist
          const key = `${id}_${artistText.toLowerCase()}`;
          if (!concertsMap.has(key)) {
            concertsMap.set(key, {
              artist: artistText,
              venue: venueText || 'Santa Fe Railyard Plaza',
              date,
              listingUrl: fullListingUrl,
              ticketUrl: ticketUrl || undefined,
              sourceEventId: id,
              description,
              source: 'Lensic 360'
            });
          }

          // If there are supporting acts, add them as separate concerts
          if (subArtistText) {
            const cleanSub = subArtistText.replace(/^(w\/|with|ft\.|featuring)\s+/i, '').trim();
            const parts = cleanSub.split(/,|\s+&\s+|\s+and\s+/i);
            for (const part of parts) {
              const subArtist = this.cleanArtistName(part.trim());
              if (subArtist && subArtist.toLowerCase() !== artistText.toLowerCase()) {
                const subKey = `${id}_${subArtist.toLowerCase()}`;
                if (!concertsMap.has(subKey)) {
                  concertsMap.set(subKey, {
                    artist: subArtist,
                    venue: venueText || 'Santa Fe Railyard Plaza',
                    date,
                    listingUrl: fullListingUrl,
                    ticketUrl: ticketUrl || undefined,
                    sourceEventId: id,
                    description,
                    source: 'Lensic 360'
                  });
                }
              }
            }
          }
        });
      } catch (error) {
        console.error(`Error fetching from Lensic 360 (${url}):`, error);
      }
    }

    const concerts = Array.from(concertsMap.values());
    console.log(`Scraped ${concerts.length} unique concert entries from Lensic 360`);
    return concerts;
  }

  private cleanArtistName(name: string): string {
    let cleaned = name.trim();
    
    // Remove common concert series and pricing prefixes
    const prefixesToRemove = [
      /^FREE\s*\|\s*/i,
      /^FREE\s*-\s*/i,
      /^FREE:\s*/i,
      /^Lensic 360 Presents:\s*/i,
      /^Aprés Music Series:\s*/i,
      /^Patio Music Series:\s*/i,
      /^Santa Fe Summer Scene:\s*/i,
      /^An Evening with\b\.{0,3}\s*/i,
      /^TGIF Music Series:\s*/i,
      /^Summer Sunday ft\s*/i,
      /^Boxcar Live Presents:\s*/i,
      /^Mama Mañana Showcase:\s*/i,
      /^Meow Wolf Monster Battle:\s*/i,
    ];

    for (const prefix of prefixesToRemove) {
      cleaned = cleaned.replace(prefix, '');
    }
    
    // Remove trailing / leading whitespace
    cleaned = cleaned.trim();
    
    // Skip film screenings or non-artist names
    const lower = cleaned.toLowerCase();
    const blacklist = [
      'best in show', 'the adventures of priscilla', 'matilda', 'zootopia',
      'movie', 'film screening', 'movie night', 'free movie'
    ];
    
    if (blacklist.some(item => lower.includes(item))) {
      return '';
    }

    return cleaned;
  }
}
