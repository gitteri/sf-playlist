import SpotifyWebApi from 'spotify-web-api-node';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import http from 'http';
import url from 'url';
import stringSimilarity from 'string-similarity';

dotenv.config();

class FuzzyMatcher {
  private static readonly SIMILARITY_THRESHOLD = 0.85;
  private static readonly WORD_MATCH_THRESHOLD = 0.85;
  private static readonly MIN_WORDS_FOR_PARTIAL = 3; // Minimum words needed for partial matching

  static isMatch(searchTerm: string, target: string): boolean {
    // Normalize strings
    const normalizedSearch = searchTerm.toLowerCase().trim();
    const normalizedTarget = target.toLowerCase().trim();

    // Exact match
    if (normalizedSearch === normalizedTarget) {
      return true;
    }

    // Split into words and remove common words
    const searchWords = this.normalizeWords(normalizedSearch);
    const targetWords = this.normalizeWords(normalizedTarget);

    // If search term is longer than target, it's not a match
    if (searchWords.length > targetWords.length) {
      return false;
    }

    // If search term is significantly shorter than target, require higher similarity
    if (targetWords.length > searchWords.length * 2) {
      return false;
    }

    // Check if search term is a subset of target
    if (this.isSubset(searchWords, targetWords)) {
      // For subset matches, require at least 3 words or high similarity
      if (searchWords.length >= this.MIN_WORDS_FOR_PARTIAL) {
        return true;
      }
      // For shorter subsets, require higher similarity
      const similarity = stringSimilarity.compareTwoStrings(normalizedSearch, normalizedTarget);
      return similarity >= 0.9;
    }

    // Overall string similarity using Dice's Coefficient
    const similarity = stringSimilarity.compareTwoStrings(normalizedSearch, normalizedTarget);
    if (similarity >= this.SIMILARITY_THRESHOLD) {
      return true;
    }

    // Word-level matching with stricter requirements
    const matchingWords = searchWords.filter(word => 
      targetWords.some(targetWord => {
        const wordSimilarity = stringSimilarity.compareTwoStrings(word, targetWord);
        return wordSimilarity >= this.SIMILARITY_THRESHOLD;
      })
    );

    // Require more matching words for shorter search terms
    const requiredMatches = Math.max(
      Math.ceil(searchWords.length * this.WORD_MATCH_THRESHOLD),
      searchWords.length >= 3 ? 3 : searchWords.length
    );

    return matchingWords.length >= requiredMatches;
  }

  private static normalizeWords(text: string): string[] {
    return text
      .replace(/[&|and]/gi, '')
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(word => word.length > 0);
  }

  private static isSubset(searchWords: string[], targetWords: string[]): boolean {
    // Check if all search words appear in target in the same order
    let targetIndex = 0;
    for (const searchWord of searchWords) {
      let found = false;
      while (targetIndex < targetWords.length) {
        if (stringSimilarity.compareTwoStrings(searchWord, targetWords[targetIndex]) >= 0.9) {
          found = true;
          targetIndex++;
          break;
        }
        targetIndex++;
      }
      if (!found) return false;
    }
    return true;
  }
}

export class SpotifyService {
  private spotifyApi: SpotifyWebApi;
  private playlistId: string;
  private retryDelay = 1000; // 1 second base delay
  private maxRetries = 3;
  private tokenPath = path.join(process.cwd(), '.spotify-token.json');

  constructor(playlistId: string) {
    this.spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI,
    });
    this.playlistId = playlistId;
  }

  /**
   * Initialize Spotify API with authorization code flow
   */
  async initialize(): Promise<void> {
    try {
      // Check if we have stored tokens
      if (await this.loadTokens()) {
        console.log('Successfully loaded stored token');
        return;
      }

      // No stored tokens, need to authenticate
      console.log('No stored token found. Starting authorization flow...');
      await this.startAuthFlow();
    } catch (error) {
      console.error('Error authenticating with Spotify:', error);
      throw new Error('Failed to authenticate with Spotify API. Check your credentials.');
    }
  }

  /**
   * Load stored tokens if available
   */
  private async loadTokens(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.tokenPath)) {
        return false;
      }

      const tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
      
      // Set the access token
      this.spotifyApi.setAccessToken(tokenData.accessToken);
      this.spotifyApi.setRefreshToken(tokenData.refreshToken);

      // Check if token is expired and refresh if needed
      if (Date.now() > tokenData.expiresAt) {
        console.log('Access token expired, refreshing...');
        await this.refreshAccessToken();
      }
      
      return true;
    } catch (error) {
      console.error('Error loading tokens:', error);
      return false;
    }
  }

  /**
   * Start the authorization code flow
   */
  private async startAuthFlow(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create authorization URL with required scopes for playlist management
      const scopes = [
        'playlist-read-private',
        'playlist-read-collaborative',
        'playlist-modify-private',
        'playlist-modify-public',
        'user-read-private'
      ];
      
      const authorizeURL = this.spotifyApi.createAuthorizeURL(scopes, 'state');
      
      // Start a temporary HTTP server to handle the callback
      const server = http.createServer(async (req, res) => {
        try {
          // Parse the callback URL
          const parsedUrl = url.parse(req.url || '', true);
          
          if (parsedUrl.pathname === '/') {
            const code = parsedUrl.query.code as string;
            
            if (!code) {
              res.writeHead(400);
              res.end('Missing authorization code');
              server.close();
              reject(new Error('Missing authorization code'));
              return;
            }
            
            // Exchange the code for tokens
            const data = await this.spotifyApi.authorizationCodeGrant(code);
            
            // Set the access token and refresh token
            this.spotifyApi.setAccessToken(data.body.access_token);
            this.spotifyApi.setRefreshToken(data.body.refresh_token);
            
            // Store the tokens
            const tokenData = {
              accessToken: data.body.access_token,
              refreshToken: data.body.refresh_token,
              expiresAt: Date.now() + data.body.expires_in * 1000
            };
            
            fs.writeFileSync(this.tokenPath, JSON.stringify(tokenData));
            
            // Send success response
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authentication successful!</h1>
                  <p>You can close this window now and return to the application.</p>
                </body>
              </html>
            `);
            
            // Close the server
            server.close();
            console.log('Successfully authenticated with Spotify');
            resolve();
          }
        } catch (error) {
          console.error('Error in callback handler:', error);
          res.writeHead(500);
          res.end('Authentication failed');
          server.close();
          reject(error);
        }
      });
      
      // Start the server on a fixed port
      server.listen(8080, () => {
        console.log('Waiting for authentication...');
        console.log('Please open the following URL in your browser to authorize the application:');
        console.log(`\x1b[36m${authorizeURL}\x1b[0m`);
        console.log('After authorization, you will be redirected back to this application.');
      });
    });
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    try {
      const data = await this.spotifyApi.refreshAccessToken();
      
      // Set the new access token
      this.spotifyApi.setAccessToken(data.body.access_token);
      
      // Update the stored token
      if (fs.existsSync(this.tokenPath)) {
        const tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
        tokenData.accessToken = data.body.access_token;
        tokenData.expiresAt = Date.now() + data.body.expires_in * 1000;
        fs.writeFileSync(this.tokenPath, JSON.stringify(tokenData));
      }
      
      console.log('Successfully refreshed access token');
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Search for an artist on Spotify
   * @param artistName Name of the artist to search for
   * @returns Artist ID if found, null otherwise
   */
  async searchArtist(artistName: string): Promise<string | null> {
    return this.withRetry(async () => {
      try {
        const response = await this.spotifyApi.searchArtists(artistName, { limit: 10 });
        
        if (response.body.artists && response.body.artists.items.length > 0) {
          // First try exact match
          const exactMatch = response.body.artists.items.find(
            artist => artist.name.toLowerCase() === artistName.toLowerCase()
          );
          
          if (exactMatch) {
            return exactMatch.id;
          }

          // Then try fuzzy matching
          const fuzzyMatch = response.body.artists.items.find(artist => 
            FuzzyMatcher.isMatch(artistName, artist.name)
          );

          if (fuzzyMatch) {
            console.log(`Found fuzzy match: "${fuzzyMatch.name}" for search term "${artistName}"`);
            return fuzzyMatch.id;
          }
        }
        
        return null;
      } catch (error) {
        console.error(`Error searching for artist ${artistName}:`, error);
        return null;
      }
    });
  }

  /**
   * Get top tracks for an artist
   * @param artistId Spotify artist ID
   * @param limit Number of tracks to return
   * @returns Array of track IDs
   */
  async getArtistTopTracks(artistId: string, limit: number = 3): Promise<string[]> {
    return this.withRetry(async () => {
      try {
        // Using US market as default, can be parameterized later
        const response = await this.spotifyApi.getArtistTopTracks(artistId, 'US');
        
        return response.body.tracks
          .slice(0, limit)
          .map(track => track.id);
      } catch (error) {
        console.error(`Error getting top tracks for artist ${artistId}:`, error);
        return [];
      }
    });
  }

  /**
   * Add tracks to the playlist
   * @param trackIds Array of track IDs to add
   * @returns Whether the operation was successful
   */
  async addTracksToPlaylist(trackIds: string[]): Promise<boolean> {
    if (trackIds.length === 0) return true;
    
    return this.withRetry(async () => {
      try {
        // Add tracks in chunks of 100 (Spotify API limit)
        const chunkSize = 100;
        for (let i = 0; i < trackIds.length; i += chunkSize) {
          const chunk = trackIds.slice(i, i + chunkSize);
          const trackUris = chunk.map(id => `spotify:track:${id}`);
          await this.spotifyApi.addTracksToPlaylist(this.playlistId, trackUris);
          
          // Sleep to avoid rate limiting if there are more chunks
          if (i + chunkSize < trackIds.length) {
            await this.sleep(300); // 300ms delay between chunks
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error adding tracks to playlist:', error);
        return false;
      }
    });
  }

  /**
   * Clear all tracks from the playlist
   * @returns Whether the operation was successful
   */
  async clearPlaylist(): Promise<boolean> {
    return this.withRetry(async () => {
      try {
        // Get all tracks in playlist (with pagination support)
        let allTracks: { uri: string }[] = [];
        let offset = 0;
        const limit = 100;
        
        while (true) {
          const playlistTracks = await this.spotifyApi.getPlaylistTracks(this.playlistId, { offset, limit });
          
          if (playlistTracks.body.items.length === 0) {
            break;
          }
          
          const trackUris = playlistTracks.body.items
            .filter(item => item.track !== null)
            .map(item => ({ uri: item.track!.uri }));
          
          allTracks = [...allTracks, ...trackUris];
          
          if (playlistTracks.body.items.length < limit) {
            break;
          }
          
          offset += limit;
          await this.sleep(300); // Small delay to avoid rate limiting
        }
        
        if (allTracks.length === 0) {
          return true;
        }
        
        // Remove tracks in chunks of 100 (Spotify API limit)
        const chunkSize = 100;
        for (let i = 0; i < allTracks.length; i += chunkSize) {
          const chunk = allTracks.slice(i, i + chunkSize);
          await this.spotifyApi.removeTracksFromPlaylist(this.playlistId, chunk);
          
          // Sleep to avoid rate limiting if there are more chunks
          if (i + chunkSize < allTracks.length) {
            await this.sleep(300); // 300ms delay between chunks
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error clearing playlist:', error);
        return false;
      }
    });
  }

  /**
   * Get the current playlist information
   * @returns Playlist details
   */
  async getPlaylistDetails() {
    return this.withRetry(async () => {
      try {
        const response = await this.spotifyApi.getPlaylist(this.playlistId);
        return response.body;
      } catch (error) {
        console.error('Error fetching playlist details:', error);
        throw new Error(`Failed to get playlist details for ID: ${this.playlistId}`);
      }
    });
  }
  
  /**
   * Helper method to retry API calls with exponential backoff
   * @param fn Function to retry
   * @returns Result of the function
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let retries = 0;
    
    while (true) {
      try {
        return await fn();
      } catch (error: any) {
        // If token expired, try to refresh it
        if (error.statusCode === 401) {
          try {
            await this.refreshAccessToken();
            // Retry immediately after token refresh
            continue;
          } catch (refreshError) {
            console.error('Error refreshing token:', refreshError);
          }
        }
      
        retries++;
        
        // Check if we've reached max retries or if error isn't retryable
        if (retries >= this.maxRetries || !this.isRetryableError(error)) {
          throw error;
        }
        
        // Calculate backoff time with exponential increase and jitter
        const delay = this.retryDelay * Math.pow(2, retries - 1) * (0.5 + Math.random());
        console.warn(`API call failed, retrying in ${Math.round(delay)}ms (retry ${retries}/${this.maxRetries})`);
        
        await this.sleep(delay);
      }
    }
  }
  
  /**
   * Check if an error is retryable
   * @param error Error to check
   * @returns Whether the error is retryable
   */
  private isRetryableError(error: any): boolean {
    // 401 errors are handled separately in withRetry
    if (error.statusCode === 401) {
      return false;
    }
  
    // Check for rate limiting (429) or server errors (5xx)
    if (error.statusCode === 429 || (error.statusCode >= 500 && error.statusCode < 600)) {
      return true;
    }
    
    // Check for network errors
    if (error.name === 'NetworkError' || error.message?.includes('ECONNRESET')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Sleep for a specified amount of time
   * @param ms Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 