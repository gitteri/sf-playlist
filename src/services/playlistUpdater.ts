import { ConcertService } from './concert';
import { SpotifyService } from './spotify';
import { JamBaseService } from './jambase';
import { SongkickService } from './songkick';
import { Concert } from '../types/concert';
import * as fs from 'fs';
import * as path from 'path';

export class PlaylistUpdater {
  private concertService: ConcertService;
  private jambaseService: JamBaseService;
  private songkickService: SongkickService;
  private spotifyService: SpotifyService;
  
  constructor(playlistId: string) {
    this.concertService = new ConcertService();
    this.jambaseService = new JamBaseService();
    this.songkickService = new SongkickService();
    this.spotifyService = new SpotifyService(playlistId);
  }
  
  /**
   * Initialize services
   */
  async initialize(): Promise<void> {
    await this.spotifyService.initialize();
  }
  
  /**
   * Update the playlist with songs from upcoming concert artists
   */
  async updatePlaylist(): Promise<void> {
    try {
      // Fetch structured concerts from all sources
      console.log('Fetching upcoming music events from Santa Fe Reporter...');
      const sfReporterConcerts = await this.concertService.fetchAllConcerts();
      
      console.log('Fetching upcoming concert events from SongKick...');
      const songkickConcerts = await this.songkickService.fetchConcerts();
      
      // Combine all concerts
      const allConcerts = [
        ...sfReporterConcerts,
        ...songkickConcerts
      ];
      
      // Filter out non-artist events
      const validConcerts = allConcerts.filter(c => this.isArtist(c.artist));
      
      // Extract and deduplicate artist names for Spotify search
      const allArtists = this.deduplicateArtists(validConcerts.map(c => c.artist));
      
      if (allArtists.length === 0) {
        console.log('No music events found');
        return;
      }
      
      console.log(`Found ${allArtists.length} unique artists across all sources`);
      
      let addedArtists = 0;
      let addedTracks = 0;
      let trackIds: string[] = [];
      let unknownArtists: string[] = [];
      
      // Find artists on Spotify and get their top tracks
      for (const artist of allArtists) {
        console.log(`Processing artist: ${artist}`);
        
        let artistResult = await this.spotifyService.searchArtist(artist);
        if (!artistResult) {
          const cleanedArtist = this.cleanArtist(artist);
          if (cleanedArtist !== artist) {
            console.log(`  - Trying cleaned artist name: "${cleanedArtist}"`);
            artistResult = await this.spotifyService.searchArtist(cleanedArtist);
          }
        }
        
        let artistId = artistResult ? artistResult.id : null;
        let imageUrl = artistResult ? artistResult.imageUrl : undefined;
        
        if (!artistId) {
          // Try splitting co-headliners/support acts if the combined name wasn't found
          const separators = [/\s+\/\/\s+/, /\s+\/\s+/, /\s+w\/\s+/i, /\s+with\s+/i, /\s+feat\.?\s+/i, /\s+ft\.?\s+/i, /\s+and\s+/i, /\s+&\s+/];
          let splitArtists: string[] = [];
          
          for (const separator of separators) {
            if (separator.test(artist)) {
              // Special rule: if separator is "and" or "&", check if the right side starts with "the" (case-insensitive)
              // this prevents splitting single bands like "Randolph and the Variants" or "Florence and the Machine"
              if (separator.source.includes('and') || separator.source.includes('&')) {
                const parts = artist.split(separator);
                if (parts.length > 1) {
                  const rightSide = parts[1].trim().toLowerCase();
                  if (rightSide.startsWith('the ') || rightSide.startsWith('the\t')) {
                    console.log(`  - Combined name "${artist}" contains "${separator.source.includes('and') ? 'and' : '&'} The", treating as a single band name and skipping split.`);
                    continue; // Skip splitting for this separator
                  }
                }
              }
              
              splitArtists = artist.split(separator).map(s => s.trim()).filter(s => s.length > 0);
              break; // Use the first separator that matches
            }
          }
          
          // If we couldn't find the main artist on Spotify and it wasn't split by name separators,
          // let's try to extract sub-artists from the description of the event.
          if (splitArtists.length <= 1) {
            const parentConcerts = validConcerts.filter(c => c.artist.toLowerCase().trim() === artist.toLowerCase().trim());
            const parentWithDesc = parentConcerts.find(c => c.description);
            if (parentWithDesc && parentWithDesc.description) {
              const extracted = this.extractArtistsFromDescription(parentWithDesc.description);
              if (extracted.length > 0) {
                console.log(`  - Found festival/showcase: "${artist}". Extracted lineup from description: ${extracted.join(', ')}`);
                splitArtists = extracted;
              }
            }
          }
          
          if (splitArtists.length > 1) {
            console.log(`  - Combined name not found on Spotify. Splitting into: ${splitArtists.join(', ')}`);
            const subArtistsList: any[] = [];
            for (const subArtist of splitArtists) {
              const subCleaned = this.cleanArtist(subArtist);
              let subArtistResult = await this.spotifyService.searchArtist(subCleaned);
              let subArtistId = subArtistResult ? subArtistResult.id : null;
              let subImageUrl = subArtistResult ? subArtistResult.imageUrl : undefined;
              let subGenres = subArtistResult ? subArtistResult.genres : [];
              let subTracks: string[] = [];

              if (subArtistId) {
                const topTracks = await this.spotifyService.getArtistTopTracks(subArtistId, 3);
                if (topTracks.length > 0) {
                  console.log(`    - Found ${topTracks.length} tracks for split artist "${subArtist}"`);
                  subTracks = topTracks;
                  trackIds = [...trackIds, ...topTracks];
                  addedArtists++;
                  addedTracks += topTracks.length;
                  
                  // Associate track IDs with the parent concert
                  validConcerts.forEach(c => {
                    if (c.artist.toLowerCase().trim() === artist.toLowerCase().trim()) {
                      if (!c.trackIds) c.trackIds = [];
                      c.trackIds = [...c.trackIds, ...topTracks];
                      // Use the first sub-artist image found as the concert's background image
                      if (subImageUrl && !c.artistImageUrl) c.artistImageUrl = subImageUrl;
                      
                      // Merge genres
                      if (subGenres && subGenres.length > 0) {
                        if (!c.genres) c.genres = [];
                        c.genres = [...new Set([...c.genres, ...subGenres])];
                      }
                    }
                  });
                }
              } else {
                console.log(`    - Could not find split artist "${subArtist}" on Spotify`);
                unknownArtists.push(subArtist);
              }

              subArtistsList.push({
                name: subArtist,
                spotifyId: subArtistId || undefined,
                artistImageUrl: subImageUrl || undefined,
                genres: subGenres && subGenres.length > 0 ? subGenres : undefined,
                trackIds: subTracks.length > 0 ? subTracks : undefined
              });
            }
            
            // Assign sub-artists to parent concerts
            validConcerts.forEach(c => {
              if (c.artist.toLowerCase().trim() === artist.toLowerCase().trim()) {
                c.subArtists = subArtistsList;
              }
            });
            continue; // Skip the rest of the main loop for the combined name
          }
          
          console.log(`  - Could not find artist "${artist}" on Spotify, skipping`);
          unknownArtists.push(artist);
          continue;
        }
        
        const topTracks = await this.spotifyService.getArtistTopTracks(artistId, 3);
        if (topTracks.length === 0) {
          console.log(`  - No tracks found for artist "${artist}", skipping`);
          continue;
        }
        
        console.log(`  - Found ${topTracks.length} tracks for artist "${artist}"`);
        trackIds = [...trackIds, ...topTracks];
        addedArtists++;
        addedTracks += topTracks.length;
 
        // Associate track IDs, artist image URL, and genres with the concert
        validConcerts.forEach(c => {
          if (c.artist.toLowerCase().trim() === artist.toLowerCase().trim()) {
            c.trackIds = topTracks;
            c.spotifyId = artistId || undefined;
            if (imageUrl) c.artistImageUrl = imageUrl;
            if (artistResult?.genres && artistResult.genres.length > 0) {
              c.genres = artistResult.genres;
            }
          }
        });
      }

      // Write to JSON for the website (now including all resolved Spotify track IDs)
      console.log(`Writing ${validConcerts.length} concerts to docs/concerts.json...`);
      this.writeConcertsToJSON(validConcerts);

      // Clear existing playlist
      console.log('Clearing existing playlist...');
      await this.spotifyService.clearPlaylist();
      
      // Add all tracks to playlist
      if (trackIds.length > 0) {
        console.log(`Adding ${trackIds.length} tracks to playlist...`);
        const success = await this.spotifyService.addTracksToPlaylist(trackIds);
        
        if (success) {
          console.log(`Successfully updated playlist with ${addedTracks} tracks from ${addedArtists} artists`);
          console.log('Unknown artists:', `${unknownArtists.join('\n')}`);
        } else {
          console.error('Failed to update playlist');
        }
      } else {
        console.log('No tracks found for any artists');
      }
    } catch (error) {
      console.error('Error updating playlist:', error);
      throw error;
    }
  }
  
  /**
   * Get playlist details
   */
  async getPlaylistDetails() {
    return this.spotifyService.getPlaylistDetails();
  }
  
  /**
   * Deduplicate artist names with case-insensitive comparison
   * @param artists Array of artist names that may contain duplicates
   * @returns Deduplicated array of artist names
   */
  /**
   * Check if a name represents a real music artist, filtering out generic event names
   */
  private isArtist(name: string): boolean {
    const lower = name.toLowerCase().trim();
    if (!lower) return false;

    // List of blacklisted substrings or exact matches
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

  /**
   * Parse description to extract artist names (useful for festivals or showcases)
   */
  private extractArtistsFromDescription(description: string): string[] {
    if (!description) return [];
    
    // Clean HTML tags first
    const cleanText = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    const patterns = [
      /performances from\s+([^.]+)/i,
      /performances by\s+([^.]+)/i,
      /performance by\s+([^.]+)/i,
      /featuring\s+([^.]+)/i,
      /features\s+([^.]+)/i,
      /with guest\s+([^.]+)/i,
      /with guests\s+([^.]+)/i,
      /with\s+([^.]+)/i,
      /live music by\s+([^.]+)/i,
      /music by\s+([^.]+)/i,
      /lineup includes:\s+([^.]+)/i,
      /lineup:\s+([^.]+)/i,
      /line-up:\s+([^.]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        // Split matched string by common separators like comma, "and", "&"
        const listStr = match[1].split(/,|and|&/i);
        const extracted = listStr
          .map(s => s.trim())
          // Filter out words that are too short or common filler words
          .filter(s => s.length > 2 && !/^(the|with|also|special|guests|local|artists)$/i.test(s))
          .map(s => {
             // Clean trailing/leading non-alphanumeric punctuation
             return s.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
          })
          .filter(s => s.length > 2);
          
        if (extracted.length > 0) {
          return extracted;
        }
      }
    }
    
    return [];
  }

  private deduplicateArtists(artists: string[]): string[] {
    const seen = new Set<string>();
    const deduplicated: string[] = [];
    
    for (const artist of artists) {
      const lowerCaseArtist = artist.toLowerCase().trim();
      if (!seen.has(lowerCaseArtist) && lowerCaseArtist && this.isArtist(artist)) {
        seen.add(lowerCaseArtist);
        deduplicated.push(artist);
      }
    }
    
    return deduplicated;
  }

  /**
   * Clean up artist name by removing prefixes
   * @param artist Original artist name
   * @returns Cleaned artist name
   */
  private cleanArtist(artist: string): string {
    // TODO: Update this list with actual prefixes to be removed
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

  /**
   * Write concerts list to a JSON file for the website
   */
  private writeConcertsToJSON(concerts: Concert[]): void {
    try {
      const docsDir = path.join(process.cwd(), 'docs');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }
      const outputPath = path.join(docsDir, 'concerts.json');
      fs.writeFileSync(outputPath, JSON.stringify(concerts, null, 2), 'utf8');
      console.log(`Successfully wrote concerts JSON to: ${outputPath}`);
    } catch (error) {
      console.error('Error writing concerts JSON file:', error);
    }
  }
}