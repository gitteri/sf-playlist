import dotenv from 'dotenv';
import { PlaylistUpdater } from './services/playlistUpdater';

// Load environment variables
dotenv.config();

// Specified playlist ID
const PLAYLIST_ID = '7IhapNTY8GMvqflSaVyQfP';

async function main() {
  console.log('Santa Fe Concert Playlist Updater');
  console.log('--------------------------------');
  
  try {
    // Initialize the playlist updater
    const playlistUpdater = new PlaylistUpdater(PLAYLIST_ID);
    await playlistUpdater.initialize();
    
    // Get playlist details
    const playlistDetails = await playlistUpdater.getPlaylistDetails();
    console.log(`Updating playlist: ${playlistDetails.name}`);
    
    // Update the playlist with songs from upcoming concerts
    await playlistUpdater.updatePlaylist();
    
    console.log('Playlist update complete!');
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 