import axios from 'axios';

export interface MatchResult {
  match: boolean;
  reason: string;
}

export class LlmMatcher {
  private url = 'http://localhost:11434/api/generate';
  private model: string | null = null;
  private checkedOllama = false;

  /**
   * Initialize and detect local Ollama service and models
   */
  async initialize(): Promise<boolean> {
    if (this.checkedOllama) return this.model !== null;
    this.checkedOllama = true;
    
    try {
      const response = await axios.get('http://localhost:11434/api/tags', { timeout: 1500 });
      const models = response.data?.models || [];
      const names = models.map((m: any) => m.name);
      
      const preferred = ['gemma4:12b-mlx', 'qwen3:8b', 'qwen3.6:27b', 'llama3:8b', 'llama3', 'mistral'];
      for (const pref of preferred) {
        const found = names.find((n: string) => n === pref || n.startsWith(pref));
        if (found) {
          this.model = found;
          console.log(`LLM Matcher: Using local model "${this.model}" for verification.`);
          return true;
        }
      }
      
      if (names.length > 0) {
        this.model = names[0];
        console.log(`LLM Matcher: Using local model "${this.model}" for verification.`);
        return true;
      }
    } catch (err: any) {
      // Ollama not running
      console.log('LLM Matcher: Local Ollama service not found or not running. Falling back to heuristic warnings.');
    }
    
    return false;
  }

  /**
   * Verify if a Spotify artist match is correct using the local LLM
   */
  async verifyMatch(params: {
    artistName: string;
    venue: string;
    eventDescription: string;
    spotifyArtistName: string;
    spotifyGenres: string[];
    spotifyPopularity: number;
    topTrackNames: string[];
  }): Promise<MatchResult | null> {
    const isAvailable = await this.initialize();
    if (!isAvailable || !this.model) return null;

    const prompt = `You are an expert music researcher verifying if a local concert booking matches a specific Spotify artist profile.

Local Event Details:
- Booked Artist: ${params.artistName}
- Venue: ${params.venue} (Santa Fe, NM)
- Event Description: ${params.eventDescription || 'No description available'}

Spotify Candidate Profile:
- Spotify Artist Name: ${params.spotifyArtistName}
- Genres: ${JSON.stringify(params.spotifyGenres)}
- Popularity (0-100): ${params.spotifyPopularity}
- Top Track Names: ${JSON.stringify(params.topTrackNames)}

Does this Spotify artist profile match the local artist booked for the Santa Fe concert?

Be extremely strict and conservative. We want to avoid adding tracks from the wrong artist to the playlist.
Consider these rules:
1. Name Match: The name must be an exact match or a very close variant.
2. Popularity & Venue: If the venue is a small local bar, lounge, or hotel, and the Spotify artist has high popularity (e.g. > 45), they are likely a major artist/band and NOT this local booking (unless the description/tour details explicitly confirm they are touring).
3. Obscure Artists (Popularity <= 10 or Empty Genres): There are often multiple different obscure/amateur artists who share the same name on Spotify. If the Spotify artist has empty genres and very low popularity, do NOT assume they match just because the name is the same. Look closely at the top track names and the local event description.
   - If the event description describes acoustic styles ("jazz standards", "classical piano", "traditional folk/bluegrass", "Spanish guitar"), but the Spotify candidate's top tracks are "Lunatic", "Paranoid", "Heavy Metal", "Techno Mix" or other names that conflict with that style, you must REJECT the match.
   - If the event description describes a specific acoustic/traditional style and the Spotify candidate has no matching genres or tracks showing that style, reject the match due to lack of positive alignment.
4. Generic/Empty Descriptions: If the event description is generic or brief, but the Spotify candidate's name matches exactly and is a distinct proper band/artist name (not a generic dictionary word or common phrase like "rock", "soul", "beyond", "cocktail", "pool party"), you should confirm the match unless there is active evidence of a conflict. Only reject if the name itself is highly generic, or if the tracks/genres suggest a completely different style than typical local bookings.

Respond with a JSON object:
{
  "match": true/false,
  "reason": "Explain your decision, referencing specific track names, genres, or descriptions that led to your conclusion"
}`;

    try {
      const response = await axios.post(this.url, {
        model: this.model,
        prompt: prompt,
        stream: false,
        format: 'json'
      }, { timeout: 45000 });

      const rawResponse = response.data?.response || '';
      let cleanedJson = rawResponse.trim();

      // Strip markdown code fences if present
      const codeBlockRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
      const match = cleanedJson.match(codeBlockRegex);
      if (match) {
        cleanedJson = match[1].trim();
      } else {
        // Fallback: extract substring between first '{' and last '}'
        const firstBrace = cleanedJson.indexOf('{');
        const lastBrace = cleanedJson.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
        }
      }

      const parsedResult = JSON.parse(cleanedJson);
      const result: MatchResult = {
        match: typeof parsedResult.match === 'string'
          ? parsedResult.match.toLowerCase() === 'true'
          : Boolean(parsedResult.match),
        reason: parsedResult.reason || 'No reason provided'
      };

      return result;
    } catch (err: any) {
      console.error(`LLM Matcher: Error during match verification:`, err.message);
      return null;
    }
  }

  /**
   * Extract performing artist names from a festival's event description
   */
  async extractArtistsFromDescription(eventName: string, description: string): Promise<string[] | null> {
    const isAvailable = await this.initialize();
    if (!isAvailable || !this.model) return null;

    const prompt = `You are a music booking assistant. Given the title of an event and its description, extract all the performing music artist/band names mentioned.
Do NOT include the names of presenters, venues, hosts, sponsors, or non-performing individuals.
Only extract the actual musical acts performing at the event.

Event Title: ${eventName}
Event Description: ${description}

Respond with a JSON object:
{
  "artists": ["Artist Name 1", "Artist Name 2", ...]
}
Provide ONLY the JSON response.`;

    try {
      const response = await axios.post(this.url, {
        model: this.model,
        prompt: prompt,
        stream: false,
        format: 'json'
      }, { timeout: 30000 });

      const rawResponse = response.data?.response || '';
      let cleanedJson = rawResponse.trim();

      // Strip markdown code fences if present
      const codeBlockRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
      const match = cleanedJson.match(codeBlockRegex);
      if (match) {
        cleanedJson = match[1].trim();
      } else {
        // Fallback: extract substring between first '{' and last '}'
        const firstBrace = cleanedJson.indexOf('{');
        const lastBrace = cleanedJson.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
        }
      }

      const parsedResult = JSON.parse(cleanedJson);
      if (Array.isArray(parsedResult.artists)) {
        return parsedResult.artists
          .map((a: any) => String(a).trim())
          .filter((a: string) => a.length > 0);
      }
      return null;
    } catch (err: any) {
      console.error(`LLM Matcher: Error during artist extraction from description:`, err.message);
      return null;
    }
  }
}

