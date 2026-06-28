import { ConcertService } from './concert';
import { SpotifyService } from './spotify';
import { JamBaseService } from './jambase';
import { SongkickService } from './songkick';
import { HotelGlorietaService } from './hotelGlorieta';
import { MeowWolfService } from './meowWolf';
import { ElReyCourtService } from './elReyCourt';
import { TheMysticService } from './theMystic';
import { Lensic360Service } from './lensic360';
import { LlmMatcher } from './llmMatcher';
import { Concert } from '../types/concert';
import * as fs from 'fs';
import * as path from 'path';

export class PlaylistUpdater {
  private concertService: ConcertService;
  private jambaseService: JamBaseService;
  private songkickService: SongkickService;
  private hotelGlorietaService: HotelGlorietaService;
  private meowWolfService: MeowWolfService;
  private elReyCourtService: ElReyCourtService;
  private theMysticService: TheMysticService;
  private lensic360Service: Lensic360Service;
  private spotifyService: SpotifyService;
  private llmMatcher: LlmMatcher;
  
  constructor(playlistId: string) {
    this.concertService = new ConcertService();
    this.jambaseService = new JamBaseService();
    this.songkickService = new SongkickService();
    this.hotelGlorietaService = new HotelGlorietaService();
    this.meowWolfService = new MeowWolfService();
    this.elReyCourtService = new ElReyCourtService();
    this.theMysticService = new TheMysticService();
    this.lensic360Service = new Lensic360Service();
    this.spotifyService = new SpotifyService(playlistId);
    this.llmMatcher = new LlmMatcher();
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
      const mappings = this.loadArtistMappings();
      // Fetch structured concerts from all sources
      console.log('Fetching upcoming music events from Santa Fe Reporter...');
      const sfReporterConcerts = await this.concertService.fetchAllConcerts();
      
      console.log('Fetching upcoming concert events from SongKick...');
      const songkickConcerts = await this.songkickService.fetchConcerts();
      
      console.log('Fetching upcoming events from Hotel Glorieta...');
      const hotelGlorietaConcerts = await this.hotelGlorietaService.fetchConcerts();
      
      console.log('Fetching upcoming events from Meow Wolf...');
      const meowWolfConcerts = await this.meowWolfService.fetchConcerts();
      
      console.log('Fetching upcoming events from El Rey Court...');
      const elReyCourtConcerts = await this.elReyCourtService.fetchConcerts();
      
      console.log('Fetching upcoming events from The Mystic...');
      const theMysticConcerts = await this.theMysticService.fetchConcerts();
      
      console.log('Fetching upcoming events from Lensic 360...');
      const lensic360Concerts = await this.lensic360Service.fetchConcerts();
      
      // Combine all concerts
      const allConcerts = [
        ...sfReporterConcerts,
        ...songkickConcerts,
        ...hotelGlorietaConcerts,
        ...meowWolfConcerts,
        ...elReyCourtConcerts,
        ...theMysticConcerts,
        ...lensic360Concerts
      ];
      
      // Standardize venue names
      const standardizedConcerts = allConcerts.map(c => ({
        ...c,
        venue: this.standardizeVenue(c.venue)
      }));
      
      // Filter out non-artist events
      const validConcerts = standardizedConcerts.filter(c => this.isArtist(c.artist));
      
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
        
        // Find associated venue for warning validation
        const associateConcert = validConcerts.find(c => c.artist.toLowerCase().trim() === artist.toLowerCase().trim());
        const venue = associateConcert ? associateConcert.venue : '';
        
        let artistResult = null;
        const mapping = this.checkArtistMapping(artist, mappings);
        
        if (mapping) {
          if (mapping.shouldSkip) {
            console.log(`  - Mapped to skip: "${artist}". Skipping Spotify search.`);
            unknownArtists.push(artist);
            continue;
          } else if (mapping.id) {
            console.log(`  - Found manual mapping for "${artist}" -> Spotify ID: ${mapping.id}`);
            artistResult = await this.spotifyService.getArtistById(mapping.id);
          }
        }
        
        if (!mapping) {
          artistResult = await this.spotifyService.searchArtist(artist);
          if (!artistResult) {
            const cleanedArtist = this.cleanArtist(artist);
            if (cleanedArtist !== artist) {
              console.log(`  - Trying cleaned artist name: "${cleanedArtist}"`);
              artistResult = await this.spotifyService.searchArtist(cleanedArtist);
            }
          }
          if (artistResult) {
            const description = associateConcert?.description || '';
            const topTrackNames = await this.spotifyService.getArtistTopTrackNames(artistResult.id, 3);
            const isValid = await this.validateSpotifyMatch(
              artist,
              artistResult.name,
              artistResult.popularity,
              venue,
              description,
              artistResult.genres || [],
              topTrackNames
            );
            if (!isValid) {
              artistResult = null;
            }
          }
        }
        
        let artistId = artistResult ? artistResult.id : null;
        let imageUrl = artistResult ? artistResult.imageUrl : undefined;
        
        if (!artistId) {
          // Try splitting co-headliners/support acts if the combined name wasn't found
          const separators = [/\s+\/\/\s+/, /\s+\/\s+/, /\s+w\/\s+/i, /\s+with\s+/i, /\s+feat\.?\s+/i, /\s+ft\.?\s+/i, /\s+and\s+/i, /\s+&\s+/, /\s+\+\s+/];
          let splitArtists: string[] = [];
          
          for (const separator of separators) {
            if (separator.test(artist)) {
              // Special rule: if separator is "and", "&", or "+", check if the right side indicates a single collective/band name
              // (e.g. "and the Variants", "Mumford & Sons", "Caleb & Company", "Bob & Friends", "Singer & Band")
              if (separator.source.includes('and') || separator.source.includes('&') || separator.source.includes('\\+')) {
                const parts = artist.split(separator);
                if (parts.length > 1) {
                  const rightSide = parts[1].trim().toLowerCase();
                  
                  // Common band suffix/collective nouns
                  const collectiveNouns = [
                    'the', 'company', 'co', 'co.', 'sons', 'friends', 'band', 'orchestra', 
                    'family', 'associates', 'crew', 'gang', 'trio', 'quartet', 'quintet', 
                    'group', 'collective', 'ensemble', 'players', 'singers', 'chorus', 
                    'boys', 'girls', 'brothers', 'sisters', 'his', 'her', 'their'
                  ];
                  
                  const isCollective = collectiveNouns.some(word => {
                    if (word === 'the' || word === 'his' || word === 'her' || word === 'their') {
                      return rightSide.startsWith(word + ' ') || rightSide.startsWith(word + '\t');
                    } else {
                      return rightSide === word || rightSide.startsWith(word + ' ') || rightSide.endsWith(' ' + word) || rightSide.includes(' ' + word + ' ');
                    }
                  });
                  
                  if (isCollective) {
                    console.log(`  - Combined name "${artist}" matches a collective suffix pattern, treating as a single band/artist name and skipping split.`);
                    continue; // Skip splitting for this separator
                  }
                }
              }
              
              splitArtists = artist.split(separator).map(s => s.trim()).filter(s => s.length > 0);
              break; // Use the first separator that matches
            }
          }

          if (splitArtists.length <= 1 && associateConcert?.description) {
            console.log(`  - Combined name not found on Spotify. Attempting LLM-based artist extraction from description...`);
            const extracted = await this.llmMatcher.extractArtistsFromDescription(artist, associateConcert.description);
            if (extracted && extracted.length > 0) {
              console.log(`  - LLM extracted artist(s): ${extracted.join(', ')}`);
              splitArtists = extracted;
            }
          }
          
          if (splitArtists.length > 1 || (splitArtists.length === 1 && splitArtists[0].toLowerCase().trim() !== artist.toLowerCase().trim())) {
            console.log(`  - Combined name not found on Spotify. Processing extracted/split artists: ${splitArtists.join(', ')}`);
            const subArtistsList: any[] = [];
            for (const subArtist of splitArtists) {
              const subCleaned = this.cleanArtist(subArtist);
              let subArtistResult = null;
              const subMapping = this.checkArtistMapping(subArtist, mappings);
              
              if (subMapping) {
                if (subMapping.shouldSkip) {
                  console.log(`    - Split artist mapped to skip: "${subArtist}"`);
                  unknownArtists.push(subArtist);
                  subArtistsList.push({
                    name: subArtist,
                    spotifyId: undefined
                  });
                  continue;
                } else if (subMapping.id) {
                  console.log(`    - Found manual mapping for split artist "${subArtist}" -> Spotify ID: ${subMapping.id}`);
                  subArtistResult = await this.spotifyService.getArtistById(subMapping.id);
                }
              }
              
              if (!subMapping) {
                subArtistResult = await this.spotifyService.searchArtist(subCleaned);
                if (subArtistResult) {
                  const description = associateConcert?.description || '';
                  const topTrackNames = await this.spotifyService.getArtistTopTrackNames(subArtistResult.id, 3);
                  const isValid = await this.validateSpotifyMatch(
                    subArtist,
                    subArtistResult.name,
                    subArtistResult.popularity,
                    venue,
                    description,
                    subArtistResult.genres || [],
                    topTrackNames
                  );
                  if (!isValid) {
                    subArtistResult = null;
                  }
                }
              }
              
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

      // Classify missing genres using LLM (with caching to avoid redundant calls for repeating artists)
      console.log('Classifying missing genres using LLM...');
      let classifiedCount = 0;
      const genreCache = new Map<string, string[]>();
      
      for (const concert of validConcerts) {
        if (!concert.genres || concert.genres.length === 0) {
          const artistName = concert.artist;
          const description = (concert.description || '').trim();
          if (description.length > 15) {
            const cacheKey = `${artistName}::${description}`;
            if (genreCache.has(cacheKey)) {
              concert.genres = genreCache.get(cacheKey)!;
              continue;
            }
            
            const classified = await this.llmMatcher.classifyGenre(artistName, description, concert.venue);
            if (classified && classified.length > 0) {
              console.log(`  - Classified genres for "${artistName}": ${classified.join(', ')}`);
              concert.genres = classified;
              genreCache.set(cacheKey, classified);
              classifiedCount++;
            }
          }
        }
      }
      console.log(`Successfully classified genres for ${classifiedCount} unique concerts using the LLM.`);

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
      /family-friendly.*rave/i,
      /season finale/i,
      /music series/i,
      /summer scene/i,
      /summer sundaze/i,
      /summer series/i,
      /pride concert/i,
      /father's day concert/i,
      /songwriters? circle/i,
      /songwriters? showcase/i,
      /pool party/i,
      /splashdance/i,
      /swim pass/i,
      /pool pass/i,
      /yoga/i,
    ];

    for (const pattern of blacklistPatterns) {
      if (pattern.test(lower)) {
        return false;
      }
    }

    return true;
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
   * Standardize venue names across all sources
   */
  private standardizeVenue(venue: string): string {
    const name = venue.trim();
    const lower = name.toLowerCase();
    
    if (lower.includes('meow wolf')) {
      return 'Meow Wolf';
    }
    
    if (
      lower.includes('glorieta') || 
      lower.includes('marigold room') || 
      lower.includes('lady duff')
    ) {
      return 'Hotel Glorieta';
    }
    
    // Santa Fe Brewing / The Bridge
    if (
      lower.includes('santa fe brewing') || 
      lower.includes('sf brewing') ||
      lower.includes('the bridge')
    ) {
      return 'The Bridge at Santa Fe Brewing Co.';
    }
    
    // El Rey Court / La Reina
    if (
      lower.includes('el rey') || 
      lower.includes('la reina')
    ) {
      return 'El Rey Court';
    }
    
    // Reunity Farms / Reunity Resources
    if (
      lower.includes('reunity')
    ) {
      return 'Reunity Resources';
    }
    
    // Railyard Plaza / Santa Fe Railyard Plaza
    if (
      lower.includes('railyard')
    ) {
      return 'Santa Fe Railyard Plaza';
    }
    
    // Santa Fe Plaza / THE PLAZA
    if (
      lower.includes('plaza')
    ) {
      return 'Santa Fe Plaza';
    }
    
    // Buffalo Thunder
    if (
      lower.includes('buffalo thunder')
    ) {
      return 'Buffalo Thunder Resort & Casino';
    }
    
    if (
      lower.includes('evangelo')
    ) {
      return "Evangelo's";
    }
    
    // The Mystic
    if (
      lower.includes('mystic')
    ) {
      return 'The Mystic';
    }
    
    return name;
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

  /**
   * Load manual artist mappings from artist_mappings.json if present
   */
  private loadArtistMappings(): Record<string, string | null> {
    try {
      const mappingsPath = path.join(process.cwd(), 'artist_mappings.json');
      if (fs.existsSync(mappingsPath)) {
        return JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
      }
    } catch (err) {
      console.error('Error loading artist mappings:', err);
    }
    return {};
  }

  /**
   * Check if a manual mapping exists for the artist
   */
  private checkArtistMapping(artistName: string, mappings: Record<string, string | null>): { id: string | null, shouldSkip: boolean } | null {
    const key = artistName.trim().toLowerCase();
    for (const [mk, mv] of Object.entries(mappings)) {
      if (mk.trim().toLowerCase() === key) {
        if (mv === null || mv === 'null') {
          return { id: null, shouldSkip: true };
        }
        return { id: mv, shouldSkip: false };
      }
    }
    return null;
  }

  /**
   * Validate a Spotify search match using popularity and venue heuristics to catch mismatches.
   * If a local LLM is available, it is queried to confirm the match.
   * @returns Whether the match is considered valid
   */
  private async validateSpotifyMatch(
    artistName: string,
    matchedArtistName: string,
    popularity: number,
    venue: string,
    description: string,
    genres: string[],
    topTrackNames: string[]
  ): Promise<boolean> {
    const smallVenues = [
      'hotel glorieta',
      'rio chama',
      'cowgirl',
      'evangelo',
      'la reina',
      'la boca',
      'teatro paraguas',
      'el rey court',
      'dragon room',
      'social kitchen',
      'terracotta',
      'the mystic'
    ];
    const venueLower = venue.toLowerCase();
    const isSmallVenue = smallVenues.some(sv => venueLower.includes(sv));
    
    if (!isSmallVenue) return true;
    
    const llmMatch = await this.llmMatcher.verifyMatch({
      artistName,
      venue,
      eventDescription: description,
      spotifyArtistName: matchedArtistName,
      spotifyGenres: genres,
      spotifyPopularity: popularity,
      topTrackNames
    });
    
    if (llmMatch !== null) {
      if (llmMatch.match === false) {
        console.log(`  [LLM Matcher] Rejected match: "${artistName}" vs Spotify "${matchedArtistName}" (Popularity: ${popularity}). Reason: ${llmMatch.reason}`);
        return false;
      } else {
        console.log(`  [LLM Matcher] Confirmed match: "${artistName}" vs Spotify "${matchedArtistName}". Reason: ${llmMatch.reason}`);
        return true;
      }
    }
    
    if (popularity > 40) {
      console.warn(
        `\n[WARNING] Suspicious Spotify match for local artist "${artistName}" at small venue "${venue}".\n` +
        `          Matched Spotify Artist: "${matchedArtistName}" (Popularity: ${popularity}).\n` +
        `          If this is incorrect, please override it in artist_mappings.json by setting "${artistName}": null\n`
      );
    }
    
    return true;
  }
}