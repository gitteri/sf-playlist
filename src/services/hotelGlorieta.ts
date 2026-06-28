import axios from 'axios';
import * as cheerio from 'cheerio';
import { Concert } from '../types/concert';

export class HotelGlorietaService {
  private url = 'https://www.hotelglorietasantafe.com/hotelglorietaevents';
  
  /**
   * Fetch upcoming concerts from Hotel Glorieta events page
   * @returns Array of Concert objects
   */
  async fetchConcerts(): Promise<Concert[]> {
    try {
      console.log('Fetching events from Hotel Glorieta...');
      const response = await axios.get(this.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      const wixScript = $('#wix-warmup-data').html();
      if (!wixScript) {
        console.warn('Wix warmup data not found on Hotel Glorieta page.');
        return [];
      }
      
      const parsedData = JSON.parse(wixScript);
      const events = this.findEventsArray(parsedData);
      
      if (!events || !Array.isArray(events)) {
        console.warn('No events found in Wix warmup data for Hotel Glorieta.');
        return [];
      }
      
      const concerts: Concert[] = [];
      for (const event of events) {
        const title = event.title;
        if (!title) continue;
        
        if (!this.isMusicEvent(title)) {
          continue; // Skip film screenings, tastings, etc.
        }
        
        const cleanedArtist = this.cleanArtistName(title);
        if (!cleanedArtist) continue;
        
        // Parse date
        const startDateStr = event.scheduling?.config?.startDate;
        const date = startDateStr ? new Date(startDateStr) : new Date();
        
        // Venue
        const venue = event.location?.name || 'Hotel Glorieta';
        
        // Slug/Urls
        const slug = event.slug;
        const listingUrl = slug ? `https://www.hotelglorietasantafe.com/event-details/${slug}` : this.url;
        
        let description = event.description || undefined;
        if (slug) {
          try {
            const detailUrl = `https://www.hotelglorietasantafe.com/event-details/${slug}`;
            const detailResponse = await axios.get(detailUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            const $detail = cheerio.load(detailResponse.data);
            const detailWixScript = $detail('#wix-warmup-data').html();
            if (detailWixScript) {
              const detailData = JSON.parse(detailWixScript);
              const detailEventObj = this.findEventWithDesc(detailData);
              if (detailEventObj && detailEventObj.longDescription) {
                const bioText = this.extractTextFromRichText(detailEventObj.longDescription)
                  .replace(/\s+/g, ' ')
                  .trim();
                if (bioText) {
                  description = bioText;
                }
              }
            }
          } catch (err: any) {
            console.error(`Error fetching detail page for ${slug}:`, err.message);
          }
        }
        
        concerts.push({
          artist: cleanedArtist,
          venue,
          date,
          ticketUrl: listingUrl,
          listingUrl,
          sourceEventId: event.id,
          sourceEventSlug: slug,
          description,
          source: 'Hotel Glorieta'
        });
      }
      
      console.log(`Found ${concerts.length} music events from Hotel Glorieta`);
      return concerts;
    } catch (error) {
      console.error('Error fetching from Hotel Glorieta:', error);
      return [];
    }
  }
  
  /**
   * Recursively search Wix data structure for the events array
   */
  private findEventsArray(obj: any): any[] | null {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      if (obj.length > 0 && obj[0] && typeof obj[0] === 'object' && 'title' in obj[0]) {
        return obj;
      }
      for (const item of obj) {
        const res = this.findEventsArray(item);
        if (res) return res;
      }
    } else {
      for (const key of Object.keys(obj)) {
        const res = this.findEventsArray(obj[key]);
        if (res) return res;
      }
    }
    return null;
  }
  
  /**
   * Filter out non-music events
   */
  private isMusicEvent(title: string): boolean {
    const lower = title.toLowerCase();
    const blacklist = [
      'screening', 'tasting', 'workshop', 'yoga', 'class', 'market', 
      'pop-up', 'gallery', 'exhibition', 'pool party', 'splashdance', 
      'swim pass', 'pool pass'
    ];
    return !blacklist.some(word => lower.includes(word));
  }
  
  /**
   * Clean up event title to get artist name
   */
  private cleanArtistName(title: string): string {
    let name = title.trim();
    if (name.includes(':')) {
      const parts = name.split(':');
      const rightPart = parts.slice(1).join(':').trim();
      if (rightPart.length > 0) {
        name = rightPart;
      }
    }
    
    // Remove specific prefixes if they exist
    name = name.replace(/^Jazz Night:\s*/i, '');
    name = name.replace(/^Jazz Night\s+-\s*/i, '');
    
    return name.trim();
  }

  /**
   * Recursively search Wix data structure for the event object containing longDescription
   */
  private findEventWithDesc(obj: any): any | null {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.longDescription || obj.about) {
      return obj;
    }
    for (const key of Object.keys(obj)) {
      const res = this.findEventWithDesc(obj[key]);
      if (res) return res;
    }
    return null;
  }

  /**
   * Recursively extract raw text strings from Wix Slate rich text longDescription JSON
   */
  private extractTextFromRichText(obj: any): string {
    if (!obj) return '';
    if (typeof obj === 'string') return '';
    if (Array.isArray(obj)) {
      return obj.map(item => this.extractTextFromRichText(item)).join('');
    }
    let text = '';
    if (obj.textData && typeof obj.textData.text === 'string') {
      text += obj.textData.text;
    } else if (obj.text && typeof obj.text === 'string' && obj.type === 'text') {
      text += obj.text;
    } else {
      for (const val of Object.values(obj)) {
        if (typeof val === 'object') {
          text += this.extractTextFromRichText(val);
        }
      }
    }
    return text;
  }
}
