import { ConcertService } from './concert';
import { SpotifyService } from './spotify';
import { JamBaseService } from './jambase';
import { SongkickService } from './songkick';

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
      // Fetch artists from all sources
      console.log('Fetching upcoming music events from Santa Fe Reporter...');
      const sfReporterArtists = await this.concertService.fetchAllMusicArtists();
      
      console.log('Fetching upcoming concert events from JamBase...');
      const jambaseArtists = await this.jambaseService.fetchConcerts();
      
      console.log('Fetching upcoming concert events from SongKick...');
      const songkickArtists = await this.songkickService.fetchArtists();
      
      // Combine and deduplicate artists from all sources
      const allArtists = this.deduplicateArtists([
        ...jambaseArtists, 
        ...songkickArtists,
        ...sfReporterArtists
      ]);
      
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
        
        let artistId = await this.spotifyService.searchArtist(artist);
        if (!artistId) {
          const cleanedArtist = this.cleanArtist(artist);
          if (cleanedArtist !== artist) {
            console.log(`  - Trying cleaned artist name: "${cleanedArtist}"`);
            artistId = await this.spotifyService.searchArtist(cleanedArtist);
          }
        }
        
        if (!artistId) {
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
      }

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
  private deduplicateArtists(artists: string[]): string[] {
    const seen = new Set<string>();
    const deduplicated: string[] = [];
    
    for (const artist of artists) {
      const lowerCaseArtist = artist.toLowerCase().trim();
      if (!seen.has(lowerCaseArtist) && lowerCaseArtist) {
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
}