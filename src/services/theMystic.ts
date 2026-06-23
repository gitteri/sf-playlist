import axios from 'axios';
import { Concert } from '../types/concert';

export class TheMysticService {
  private url = 'https://themysticsantafe.com/wp-json/tribe/events/v1/events?per_page=50&status=publish';
  
  /**
   * Fetch upcoming concerts from The Mystic calendar REST API
   * @returns Array of Concert objects
   */
  async fetchConcerts(): Promise<Concert[]> {
    try {
      console.log('Fetching events from The Mystic...');
      const response = await axios.get(this.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const events = response.data?.events;
      if (!events || !Array.isArray(events)) {
        console.warn('No events array found in The Mystic REST API response.');
        return [];
      }
      
      console.log(`Found ${events.length} raw events in The Mystic API response`);
      const concerts: Concert[] = [];
      
      for (const event of events) {
        let title = event.title || '';
        if (!title) continue;
        
        title = this.decodeHtmlEntities(title).trim();
        if (!this.isMusicEvent(title)) {
          continue; // Skip yoga, tarot, classes, tastings, workshops, etc.
        }
        
        const artist = this.cleanArtistName(title);
        if (!artist) continue;
        
        // Parse date details to avoid timezone parsing mismatch
        const details = event.start_date_details;
        let date = new Date();
        if (details && details.year && details.month && details.day) {
          const year = parseInt(details.year, 10);
          const month = parseInt(details.month, 10) - 1; // 0-indexed
          const day = parseInt(details.day, 10);
          const hour = parseInt(details.hour || '0', 10);
          const minutes = parseInt(details.minutes || '0', 10);
          const seconds = parseInt(details.seconds || '0', 10);
          date = new Date(year, month, day, hour, minutes, seconds);
        } else if (event.start_date) {
          date = new Date(event.start_date);
        }
        
        // Venue
        const venue = event.venue?.venue ? 'The Mystic' : 'The Mystic';
        
        // Listing/Ticket URL
        const listingUrl = event.url || 'https://themysticsantafe.com/calendar/';
        const ticketUrl = event.website || listingUrl;
        
        // Parse description
        let description = event.description || '';
        if (description) {
          // Strip HTML tags and clean up whitespace
          description = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          description = this.decodeHtmlEntities(description);
        }
        
        concerts.push({
          artist,
          venue,
          date,
          ticketUrl,
          listingUrl,
          sourceEventId: event.id,
          sourceEventSlug: event.slug || undefined,
          description: description || undefined,
          source: 'The Mystic'
        });
      }
      
      console.log(`Found ${concerts.length} music events from The Mystic`);
      return concerts;
    } catch (error) {
      console.error('Error fetching from The Mystic:', error);
      return [];
    }
  }
  
  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&ndash;/g, '-')
      .replace(/&mdash;/g, '-')
      .replace(/&nbsp;/g, ' ');
  }
  
  private isMusicEvent(title: string): boolean {
    const lower = title.toLowerCase();
    const blacklist = [
      'screening', 'tasting', 'workshop', 'yoga', 'class', 'market', 
      'pop-up', 'gallery', 'exhibition', 'book club', 'silent book club', 
      'bingo', 'talk with', 'seminar', 'tarot', 'astrology'
    ];
    return !blacklist.some(word => lower.includes(word));
  }
  
  private cleanArtistName(title: string): string {
    let name = title.trim();
    
    // Remove common prefixes/suffixes
    const prefixes = [
      /^Live Music:\s*/i,
      /^Concert:\s*/i,
      /^Live Music ft\.\s*/i,
      /^Live Music ft\s*/i,
      /^Music ft\.\s*/i,
      /^Music ft\s*/i
    ];
    
    for (const prefix of prefixes) {
      name = name.replace(prefix, '');
    }
    
    return name.trim();
  }
}
