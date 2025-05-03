import dotenv from 'dotenv';
import { PlaylistUpdater } from './services/playlistUpdater';

// Load environment variables
dotenv.config();

// Specified playlist ID
const PLAYLIST_ID = '7IhapNTY8GMvqflSaVyQfP';

// Update interval in milliseconds (default: 24 hours)
const UPDATE_INTERVAL = process.env.UPDATE_INTERVAL 
  ? parseInt(process.env.UPDATE_INTERVAL, 10) 
  : 24 * 60 * 60 * 1000;

/**
 * Run the playlist update process
 */
async function updatePlaylist() {
  console.log('Starting playlist update:', new Date().toISOString());
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
    console.error('Error during playlist update:', error);
  }
  
  // Schedule next update
  console.log(`Next update scheduled in ${UPDATE_INTERVAL / (60 * 60 * 1000)} hours`);
  setTimeout(updatePlaylist, UPDATE_INTERVAL);
}

// Start the scheduled updates
updatePlaylist().catch(error => {
  console.error('Fatal error in scheduled update:', error);
  process.exit(1);
}); 