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
  ticketUrl?: string;
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