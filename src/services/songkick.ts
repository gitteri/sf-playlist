import axios from 'axios';
import * as cheerio from 'cheerio';
import { SongkickArtist, SongkickConcert } from '../types/songkick';
import { Concert } from '../types/concert';

export class SongkickService {
  private santaFeUrl = 'https://www.songkick.com/metro-areas/90736-us-santa-fe';
  
  /**
   * Fetch upcoming concerts from SongKick
   * @returns Array of artist names
   */
  async fetchArtists(): Promise<string[]> {
    try {
      console.log('Fetching data from SongKick...');
      const response = await axios.get(this.santaFeUrl);
      
      // Parse the HTML using cheerio
      const $ = cheerio.load(response.data);
      const artists = this.extractArtistsFromPage($);
      
      console.log(`Found ${artists.length} artists on SongKick`);
      return artists;
    } catch (error) {
      console.error('Error fetching from SongKick:', error);
      return [];
    }
  }

  /**
   * Fetch upcoming concerts from Songkick with full details (Concert objects)
   * @returns Array of Concert objects
   */
  async fetchConcerts(): Promise<Concert[]> {
    try {
      console.log('Fetching structured concert data from SongKick...');
      const response = await axios.get(this.santaFeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const $ = cheerio.load(response.data);
      const concerts: Concert[] = [];

      $('li.event-listings-element').each((_, element) => {
        try {
          const cityName = $(element).find('.city-name').text().trim();
          if (cityName && !cityName.toLowerCase().includes('santa fe')) {
            return;
          }

          const datetimeStr = $(element).find('time').attr('datetime');
          const date = datetimeStr ? new Date(datetimeStr) : new Date();
          const venue = $(element).find('a.venue-link').text().trim() || 'Unknown Venue';
          
          const relativeTicketUrl = $(element).find('a.event-link').attr('href') || '';
          const ticketUrl = relativeTicketUrl ? `https://www.songkick.com${relativeTicketUrl}` : undefined;

          // Extract headliner(s)
          const headlinerText = $(element).find('p.artists strong').text().trim();
          const artistsList: string[] = [];
          if (headlinerText) {
            headlinerText.split(', ').forEach(a => {
              if (a.trim()) {
                const cleaned = this.cleanArtistName(a.trim());
                if (cleaned) artistsList.push(cleaned);
              }
            });
          }

          // Extract supporting acts
          $(element).find('p.artists .support').each((_, supportElement) => {
            const supportText = $(supportElement).text().trim();
            if (supportText) {
              const cleaned = this.cleanArtistName(supportText);
              if (cleaned) artistsList.push(cleaned);
            }
          });

          // Add a Concert entry for each artist in this show
          artistsList.forEach(artist => {
            concerts.push({
              artist,
              venue,
              date,
              ticketUrl,
              listingUrl: ticketUrl,
              source: 'Songkick'
            });
          });
        } catch (error) {
          console.error('Error extracting concert info from Songkick element:', error);
        }
      });

      return concerts;
    } catch (error) {
      console.error('Error fetching structured concerts from Songkick:', error);
      return [];
    }
  }
  
  /**
   * Extract artist names from the SongKick page
   * @param $ Cheerio instance with loaded HTML
   * @returns Array of artist names
   */
  private extractArtistsFromPage($: cheerio.CheerioAPI): string[] {
    const artists: string[] = [];
    
    // Find concert listings using the new structure
    $('li.event-listings-element').each((_, element) => {
      try {
        const cityName = $(element).find('.city-name').text().trim();
        if (cityName && !cityName.toLowerCase().includes('santa fe')) {
          return;
        }
        // Extract headliner(s) from the new structure
        const headliner = $(element).find('p.artists strong').text().trim();
        if (headliner) {
          // Split headliners if multiple artists are listed
          const headliners = headliner.split(', ');
          headliners.forEach(artist => {
            if (artist.trim()) {
              artists.push(artist.trim());
            }
          });
        }
        
        // Extract supporting acts if present (new structure)
        $(element).find('p.artists .support').each((_, supportElement) => {
          const supportText = $(supportElement).text().trim();
          if (supportText) {
            artists.push(supportText);
          }
        });
      } catch (error) {
        console.error('Error extracting artist info:', error);
      }
    });
    
    // If no artists were found using the primary selectors, try fallback selectors
    if (artists.length === 0) {
      // Find concert listings (old structure fallback)
      $('.event-listings .event-listing').each((_, element) => {
        try {
          const cityName = $(element).find('.city-name').text().trim();
          if (cityName && !cityName.toLowerCase().includes('santa fe')) {
            return;
          }
          // Extract headliner
          const headliner = $(element).find('.artists strong, .artists .headliner').text().trim();
          if (headliner) {
            artists.push(headliner);
          }
          
          // Extract supporting acts
          $(element).find('.artists .support .summary-item-list a').each((_, supportAct) => {
            const supportName = $(supportAct).text().trim();
            if (supportName) {
              artists.push(supportName);
            }
          });
        } catch (error) {
          console.error('Error extracting artist info:', error);
        }
      });
    }
    
    // Clear out any empty values and filter out obvious non-artist texts
    return artists
      .filter(artist => 
        artist && 
        artist.trim() !== '' && 
        !artist.includes('...') &&
        !artist.startsWith('Filter by') &&
        !artist.startsWith('All') &&
        !artist.includes('Outdoor') &&
        !artist.includes('Concert') &&
        !artist.includes('Tickets') &&
        !artist.includes('Tour') 
      )
      .map(artist => this.cleanArtistName(artist));
  }
  
  /**
   * Clean up artist names to remove any common patterns that aren't part of the name
   */
  private cleanArtistName(artistName: string): string {
    let result = artistName.trim();
    
    // Remove "Concert Tickets - 2025 Tour Dates" and similar suffixes
    result = result.replace(/Concert Tickets.*$/, '').trim();
    
    // Remove "and" at the beginning (if it's the start of a list)
    result = result.replace(/^and /i, '').trim();
    
    // Try to detect and filter out non-artist names
    const nonArtistPatterns = [
      /^\d+$/, // Just numbers
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i, // Days of the week
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i, // Months
      /^From\b/i, // Date ranges
      /^[0-9]+ Upcoming/i, // Count of events
      /Santa Fe/i, // Location references
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
        return ''; // Not a valid artist name
      }
    }
    
    return result;
  }
} 