# Santa Fe Concert Playlist Updater

This project automatically updates a Spotify playlist with songs from artists who have upcoming concerts in Santa Fe, NM.

## Features

- Scrapes concert information from multiple sources:
  - Santa Fe Reporter calendar API
  - JamBase events API
  - SongKick concert listings (web scraping)
- Identifies music events and extracts artist names
- Searches for artists on Spotify and gets their top tracks
- Updates a specified Spotify playlist with songs from upcoming artists
- Automatically deduplicates artists across all sources

## Setup

### 1. Spotify API Setup

Before running the application, you need to set up a Spotify Developer account and create an application:

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Log in with your Spotify account or create one
3. Click "Create an App"
4. Fill in the app name (e.g., "Santa Fe Concert Playlist") and description
5. Accept the terms and create the app
6. On the app dashboard, click "Edit Settings"
7. Add a Redirect URI: `http://localhost:8080/callback` (must match exactly what you put in your .env file)
8. Save the changes
9. Note your Client ID and Client Secret from the dashboard

### 2. Project Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Spotify API credentials:
   ```
   # Spotify API Credentials
   # Create an application at https://developer.spotify.com/dashboard/
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   SPOTIFY_REDIRECT_URI=http://localhost:8080/callback
   
   # Optional: Update interval in milliseconds (default: 24 hours)
   # UPDATE_INTERVAL=86400000
   ```
4. Build the project:
   ```bash
   npm run build
   ```

### 3. Playlist Configuration

The application is configured to update the Spotify playlist with ID: `7IhapNTY8GMvqflSaVyQfP`.

To use your own playlist:
1. Create a playlist in Spotify or use an existing one
2. Get the playlist ID from its URL (the string after /playlist/ in the Spotify URL)
3. Update the playlist ID in:
   - `src/index.ts` - For one-time updates
   - `src/scheduled.ts` - For scheduled updates

## Usage

When you run the application for the first time:

1. The app will display a URL in the console
2. Copy and paste this URL into your browser
3. Log in to Spotify and approve the requested permissions
4. You will be redirected to a success page
5. Return to the console and the application will continue automatically
6. Your authentication tokens will be stored locally for future use

### One-time Update

To run a single update of the playlist:

```bash
npm run update
```

### Scheduled Updates

To start the updater with automatic periodic updates:

```bash
npm run dev:scheduled
```

For production deployment, you can run as a background daemon with logs:

```bash
npm run start:daemon
```

This will run the updater in the background and write logs to `logs/playlist-updater.log`.

## Troubleshooting

### "valid user auth required" Error (401)

If you see this error, it means the application doesn't have the proper user authentication to modify the playlist. This can happen because:

1. You haven't completed the initial authorization flow
2. Your authentication tokens are expired or invalid

Solutions:
- Delete the `.spotify-token.json` file (if it exists) to trigger a new authorization flow
- Ensure you're using the correct Client ID and Client Secret in your `.env` file
- Make sure the Redirect URI in your Spotify app settings matches exactly what's in your `.env` file
- Verify that the playlist ID is correct and that your Spotify account has permission to modify it

### "INVALID_CLIENT: Invalid redirect URI" Error

This error occurs when the redirect URI in your authorization request doesn't match any of the redirect URIs registered in your Spotify Developer Dashboard. To fix:

1. Double-check that the URI in your Spotify Developer Dashboard settings matches exactly what's in your `.env` file
2. Make sure there are no extra spaces, slashes, or typos

### Node.js Compatibility Issues

The application is built to work with Node.js CommonJS modules. If you encounter any ESM-related errors:

1. Make sure you're using a compatible Node.js version
2. If needed, update the `tsconfig.json` file to ensure CommonJS module output

## Development

- `npm run dev` - Run the one-time updater in development mode
- `npm run dev:scheduled` - Run the scheduled updater in development mode
- `npm run build` - Build the project
- `npm run start` - Run the built one-time updater
- `npm run start:scheduled` - Run the built scheduled updater

## API Sources

The application uses the following data sources:
- Santa Fe Reporter Event Calendar API: `https://calendar.sfreporter.com/santa-fe-reporter/search.json?page=1&ongoing=true`
- JamBase Concert API: `https://www.jambase.com/wp-admin/admin-ajax.php?action=jb_get_concerts_finder_results`
- SongKick Concert Listings: `https://www.songkick.com/metro-areas/90736-us-santa-fe` (web scraping)
- Spotify Web API

## How It Works

1. The application fetches event data from all three sources:
   - Santa Fe Reporter API (JSON)
   - JamBase API (JSON)
   - SongKick website (HTML scraping)
2. It filters the Santa Fe Reporter events to include only those in the "Music" category
3. It extracts artist names from all sources and deduplicates them
4. For each artist found, it searches the Spotify API to find matching artists
5. For each artist found on Spotify, it retrieves their top 3 tracks
6. All tracks are added to the specified Spotify playlist
7. In scheduled mode, this process repeats at the configured interval (default: 24 hours)

## Project Structure

- `src/services/` - Contains services for interacting with Spotify and concert data sources
- `src/types/` - TypeScript type definitions
- `src/utils/` - Utility functions and helpers

## Contributing

Feel free to open issues and pull requests! 