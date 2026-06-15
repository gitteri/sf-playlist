import axios from 'axios';
import { JamBaseResponse } from '../types/jambase';

export class JamBaseService {
  private apiUrl = 'https://www.jambase.com/wp-admin/admin-ajax.php';
  
  /**
   * Fetch upcoming concerts from JamBase API
   * @returns Array of artist names
   */
  async fetchConcerts(): Promise<string[]> {
    // Note: JamBase public endpoints now return 403 Forbidden due to Cloudflare protection.
    // We log a message and return an empty array.
    console.log('JamBase: Scraping skipped because JamBase endpoints are protected by Cloudflare (403).');
    return [];
  }
  
  /**
   * Extract artist names from JamBase response
   * @param response The JamBase API response
   * @returns Array of artist names
   */
  private extractArtists(response: JamBaseResponse): string[] {
    const artists: string[] = [];
    const chunked = response.data.results.chunked;
    
    // Iterate through each date chunk
    Object.values(chunked).forEach(dateChunk => {
      // Iterate through events in this chunk
      dateChunk.items.forEach(event => {
        // Add the main artist/performer
        if (event.title) {
          artists.push(event.title);
        }
        
        // Add supporting bands if available
        if (event.bands && Array.isArray(event.bands)) {
          artists.push(...event.bands);
        }
      });
    });
    
    return artists.filter(artist => artist && artist.trim() !== '');
  }
  
  /**
   * Format a date in YYYYMMDD format for JamBase API
   * @param date The date to format
   * @returns Formatted date string
   */
  private formatDateYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
  
  /**
   * Add years to a date
   * @param date The starting date
   * @param years Number of years to add
   * @returns New date
   */
  private addYearsToDate(date: Date, years: number): Date {
    const newDate = new Date(date);
    newDate.setFullYear(newDate.getFullYear() + years);
    return newDate;
  }
} 