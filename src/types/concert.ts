export interface SubArtist {
  name: string;
  artistImageUrl?: string;
  spotifyId?: string;
  genres?: string[];
}

export interface Concert {
  artist: string;
  venue: string;
  date: Date;
  hasTime?: boolean;
  ticketUrl?: string;
  listingUrl?: string;
  sourceEventId?: string | number;
  sourceEventSlug?: string;
  description?: string;
  spotifyId?: string;
  source: string;
  trackIds?: string[];
  artistImageUrl?: string;
  genres?: string[];
  subArtists?: SubArtist[];
}

export interface Venue {
  name: string;
  address: string;
  website?: string;
} 