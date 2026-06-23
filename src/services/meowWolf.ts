import axios from 'axios';
import * as cheerio from 'cheerio';
import { Concert } from '../types/concert';

export class MeowWolfService {
  private url = 'https://tickets.meowwolf.com/events/santa-fe';
  
  /**
   * Fetch upcoming music concerts from Meow Wolf Santa Fe
   * @returns Array of Concert objects
   */
  async fetchConcerts(): Promise<Concert[]> {
    try {
      console.log('Fetching events from Meow Wolf...');
      const response = await axios.get(this.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      const nextDataScript = $('#__NEXT_DATA__').html();
      if (!nextDataScript) {
        console.warn('Next.js data not found on Meow Wolf page.');
        return [];
      }
      
      const parsedData = JSON.parse(nextDataScript);
      const events = parsedData.props?.pageProps?.events?.events;
      
      if (!events || !Array.isArray(events)) {
        console.warn('No events array found in Meow Wolf Next.js pageProps.');
        return [];
      }
      
      const concerts: Concert[] = [];
      const musicEvents = events.filter(event => event.category === 'Music');
      
      for (const event of musicEvents) {
        const title = event.title;
        if (!title) continue;
        
        // Extract headliner and support acts
        const artistsList: string[] = [];
        const cleanedHeadliner = this.cleanArtistName(title);
        if (cleanedHeadliner) {
          artistsList.push(cleanedHeadliner);
        }
        
        if (event.text?.supportingActs) {
          const supports = event.text.supportingActs.split(',');
          for (const support of supports) {
            const cleanedSupport = this.cleanArtistName(support.trim());
            if (cleanedSupport) {
              artistsList.push(cleanedSupport);
            }
          }
        }
        
        // Get event date
        const date = event.startDateTime ? new Date(event.startDateTime) : new Date();
        
        // Get listing/ticket URL
        const eventUrl = event.url 
          ? `https://tickets.meowwolf.com/events/santa-fe/${event.url}`
          : this.url;
        
        const description = event.text?.ariaLabel || undefined;
        
        // Add a Concert entry for each artist in this show
        for (const artist of artistsList) {
          concerts.push({
            artist,
            venue: 'Meow Wolf',
            date,
            ticketUrl: eventUrl,
            listingUrl: eventUrl,
            sourceEventId: event.id,
            sourceEventSlug: event.url || undefined,
            description,
            source: 'Meow Wolf'
          });
        }
      }
      
      console.log(`Found ${concerts.length} music artist entries from Meow Wolf`);
      return concerts;
    } catch (error) {
      console.error('Error fetching from Meow Wolf:', error);
      return [];
    }
  }
  
  /**
   * Clean up event title or supporting act to get artist name
   */
  private cleanArtistName(title: string): string {
    let name = title.trim();
    
    // Remove common tour suffixes/patterns
    name = name.replace(/\s+-\s+The\s+[\w\s‘’']+\s+Tour\s*$/i, '');
    name = name.replace(/\s+:\s+Sonderlust\s+10th\s+Anniversary\s+Tour\s*$/i, '');
    name = name.replace(/\s*\(DJ\s+Set\)\s*$/i, '');
    name = name.replace(/\s+DJ\s+Set\s*$/i, '');
    name = name.replace(/\s*featuring\s+.*$/i, ''); // e.g. PRIDE {after dark} featuring DJ Tracy Young -> PRIDE {after dark}
    
    return name.trim();
  }
}
