import axios from 'axios';
import { EventResponse } from '../types/event';

export class ConcertService {
  private apiUrl = 'https://calendar.sfreporter.com/santa-fe-reporter/search.json';
  
  /**
   * Fetch upcoming concerts from Santa Fe Reporter API
   * @param page Page number to fetch
   * @returns Array of music events
   */
  async fetchMusicEvents(page: number = 1): Promise<string[]> {
    try {
      const response = await axios.get<EventResponse>(`${this.apiUrl}?page=${page}&ongoing=true`);
      
      // Filter for music events
      const musicEvents = response.data.events.filter(event => {
        // Check if any category has name "Music"
        return event._source.categories.some(category => category.name === "Music");
      });
      
      // Extract artist names and clean them up
      const artists = musicEvents.map(event => this.cleanArtistName(event._source.name));
      
      return artists.filter(name => name.length > 0); // Filter out empty names
    } catch (error) {
      console.error('Error fetching concert data:', error);
      throw error;
    }
  }
  
  /**
   * Fetch all pages of music events
   * @returns Array of all music artists
   */
  async fetchAllMusicArtists(): Promise<string[]> {
    try {
      const firstPageResponse = await axios.get<EventResponse>(`${this.apiUrl}?page=1&ongoing=true`);
      const totalPages = firstPageResponse.data.pages;
      
      let allArtists: string[] = [];
      
      // Process first page
      const firstPageArtists = this.extractMusicArtists(firstPageResponse.data);
      allArtists = [...allArtists, ...firstPageArtists];
      
      // Process remaining pages if needed
      if (totalPages > 1) {
        for (let page = 2; page <= totalPages; page++) {
          const pageArtists = await this.fetchMusicEvents(page);
          allArtists = [...allArtists, ...pageArtists];
        }
      }
      
      return [...new Set(allArtists)]; // Remove duplicates
    } catch (error) {
      console.error('Error fetching all music artists:', error);
      throw error;
    }
  }
  
  /**
   * Extract music artists from event response
   * @param response API response
   * @returns Array of artist names
   */
  private extractMusicArtists(response: EventResponse): string[] {
    const musicEvents = response.events.filter(event => {
      return event._source.categories.some(category => category.name === "Music");
    });
    
    return musicEvents
      .map(event => this.cleanArtistName(event._source.name))
      .filter(name => name.length > 0);
  }
  
  /**
   * Clean artist name from event title
   * @param eventName Raw event name
   * @returns Cleaned artist name
   */
  private cleanArtistName(eventName: string): string {
    // Remove common prefixes/suffixes
    let name = eventName.trim();
    
    // Common patterns to remove: "Live Music:", "Concert:", etc.
    const prefixesToRemove = [
      /^Live Music:\s*/i,
      /^Concert:\s*/i,
      /^Music:\s*/i,
      /^Performance by\s*/i,
      /^featuring\s*/i,
      /^Featuring\s*/i,
    ];
    
    for (const prefix of prefixesToRemove) {
      name = name.replace(prefix, '');
    }
    
    // Remove text in parentheses (often genre descriptions)
    name = name.replace(/\s*\([^)]*\)/g, '');
    
    // Remove "at [venue]" patterns
    name = name.replace(/\s*at\s+.*$/i, '');
    
    // Remove extra spaces
    name = name.trim();
    
    return name;
  }
} 