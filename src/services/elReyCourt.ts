import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { Concert } from '../types/concert';

export class ElReyCourtService {
  private mainUrl = 'https://elreycourt.com/live-music-events';
  
  /**
   * Fetch upcoming music concerts from El Rey Court
   * @returns Array of Concert objects
   */
  async fetchConcerts(): Promise<Concert[]> {
    try {
      console.log('Fetching events from El Rey Court...');
      const response = await axios.get(this.mainUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Attempt to extract dynamic config from the page
      let siteId = $('body').attr('data-site-id') || 'bb8e931aed4f4596bef5dac4eb0e6248';
      let renderId = 'b194d56f013946e5b103b0ed8aae901d'; // fallback
      
      // Look for the block with data-collections
      const collectionElem = $('[data-collections]').first();
      let queryParams: any = null;
      
      if (collectionElem.length > 0) {
        const base64Data = collectionElem.attr('data-collections');
        if (base64Data) {
          try {
            const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
            queryParams = JSON.parse(jsonStr);
            if (queryParams.design?.siteId) siteId = queryParams.design.siteId;
            if (queryParams.design?.renderId) renderId = queryParams.design.renderId;
          } catch (e: any) {
            console.warn('Failed to parse base64 data-collections from El Rey Court page:', e.message);
          }
        }
      }
      
      // If we couldn't parse the config, construct a fallback
      if (!queryParams) {
        queryParams = {
          query: {
            snapshot: 'published',
            limit: 16,
            sort: false,
            asc: true
          },
          design: {
            siteId,
            renderId
          }
        };
      }
      
      // Modify query parameters to fetch up to 100 events to handle infinite scroll
      queryParams.query.limit = 100;
      queryParams.layouts = {
        gridView1: null
      };
      
      // Generate SHA-256 signature hash expected by SpaceCrafted
      const sig = this.generateSignature(siteId, 'events', queryParams);
      
      // Post to the SpaceCrafted content API
      const apiUrl = `https://content.spacecrafted.com/${siteId}/c/events/${sig}`;
      console.log(`Querying El Rey Court collection API with limit 100...`);
      const apiResponse = await axios.post(apiUrl, queryParams, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const htmlFragment = apiResponse.data?.gridView1;
      if (!htmlFragment) {
        console.warn('No HTML fragment returned from El Rey Court API.');
        return [];
      }
      
      const $frag = cheerio.load(htmlFragment);
      const items = $frag('.eventColl-item');
      console.log(`Found ${items.length} raw events in El Rey Court API response`);
      
      const concerts: Concert[] = [];
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth(); // 0-11
      
      for (const item of items.toArray()) {
        const $item = $frag(item);
        const title = $item.find('.eventColl-eventInfo').text().trim();
        if (!title) continue;
        
        if (!this.isMusicEvent(title)) {
          continue; // Filter out yoga, book club, bingo, tastings, etc.
        }
        
        const artist = this.cleanArtistName(title);
        if (!artist) continue;
        
        // Parse month and day
        const monthText = $item.find('.eventColl-month').text().trim();
        const dateText = $item.find('.eventColl-date').text().trim();
        
        if (!monthText || !dateText) continue;
        
        const day = parseInt(dateText, 10);
        const monthIndex = this.getMonthIndex(monthText);
        if (monthIndex === -1 || isNaN(day)) continue;
        
        // Infer year (if the event month-day is in the past relative to today, it's next year)
        let year = currentYear;
        if (monthIndex < currentMonth || (monthIndex === currentMonth && day < new Date().getDate() - 1)) {
          year = currentYear + 1;
        }
        
        // Default to 7 PM America/Denver time
        const date = new Date(year, monthIndex, day, 19, 0, 0);
        
        // Permalink / listing URL
        const path = $item.find('.eventColl-eventInfo a').attr('href') || '';
        const listingUrl = path ? `https://elreycourt.com${path}` : this.mainUrl;
        
        // Fetch detailed description from detail page
        let description: string | undefined = undefined;
        if (path) {
          try {
            const detailResponse = await axios.get(listingUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              },
              timeout: 8000
            });
            const $detail = cheerio.load(detailResponse.data);
            const descHtml = $detail('.eventColl-desc').html();
            if (descHtml) {
              const cleanedText = $detail('.eventColl-desc').text().replace(/\s+/g, ' ').trim();
              if (cleanedText) {
                description = cleanedText;
              }
            }
          } catch (err: any) {
            console.error(`Error fetching detail page for El Rey Court event ${path}:`, err.message);
          }
        }
        
        concerts.push({
          artist,
          venue: 'El Rey Court',
          date,
          ticketUrl: listingUrl,
          listingUrl,
          sourceEventId: path.replace(/^\/event\//, ''),
          sourceEventSlug: path.replace(/^\/event\//, ''),
          description,
          source: 'El Rey Court'
        });
      }
      
      console.log(`Found ${concerts.length} music events from El Rey Court`);
      return concerts;
    } catch (error) {
      console.error('Error fetching from El Rey Court:', error);
      return [];
    }
  }
  
  /**
   * Deterministic stringify and SHA-256 generation
   */
  private generateSignature(siteId: string, type: string, params: any): string {
    const obj = { siteId, type, params };
    const serialized = this.deterministicStringify(obj) || '';
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }
  
  private deterministicStringify(val: any): string | undefined {
    if (val === undefined) return undefined;
    if (val === null) return 'null';
    if (typeof val === 'number') {
      return isFinite(val) ? '' + val : 'null';
    }
    if (typeof val !== 'object') {
      return JSON.stringify(val);
    }
    if (Array.isArray(val)) {
      let out = '[';
      for (let i = 0; i < val.length; i++) {
        if (i > 0) out += ',';
        out += this.deterministicStringify(val[i]) || 'null';
      }
      return out + ']';
    }
    const keys = Object.keys(val).sort();
    let out = '';
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = this.deterministicStringify(val[k]);
      if (v !== undefined) {
        if (out.length > 0) out += ',';
        out += JSON.stringify(k) + ':' + v;
      }
    }
    return '{' + out + '}';
  }
  
  private isMusicEvent(title: string): boolean {
    const lower = title.toLowerCase();
    const blacklist = [
      'screening', 'tasting', 'workshop', 'yoga', 'class', 'market', 
      'pop-up', 'gallery', 'exhibition', 'book club', 'silent book club', 
      'bingo', 'talk with', 'seminar', 'tarot', 'industry night ft. tarot'
    ];
    return !blacklist.some(word => lower.includes(word));
  }
  
  private cleanArtistName(title: string): string {
    let name = title.trim();
    
    // Remove prefixes
    const prefixes = [
      /^Queer Night Presents:\s*/i,
      /^Queer Night:\s*/i,
      /^INDUSTRY NIGHT ft\.\s*/i,
      /^INDUSTRY NIGHT ft\s*/i,
      /^Iconik Presents:\s*Summer Sundays w\/\s*/i,
      /^Iconik Presents:\s*Summer Sunday ft\s*/i,
      /^Summer Sunday ft\s*/i,
      /^Last Wednesdays with\s*/i,
      /^Agave Sin Fronteras:\s*After Party ft\.\s*/i,
      /^Agave Sin Fronteras:\s*After Party ft\s*/i,
      /^COSMOS Vol \d+:\s*Galactic New Year ft\.\s*/i,
      /^COSMOS Vol \d+:\s*Galactic New Year ft\s*/i,
      /^Locals Night\s*\+\s*/i
    ];
    
    for (const prefix of prefixes) {
      name = name.replace(prefix, '');
    }
    
    return name.trim();
  }
  
  private getMonthIndex(monthStr: string): number {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const lower = monthStr.toLowerCase().slice(0, 3);
    return months.indexOf(lower);
  }
}
