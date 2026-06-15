// State Management
let concerts = [];
let filteredConcerts = [];
let embedController = null;
let currentTrackId = null;

// DOM Elements
const searchInput = document.getElementById('search-input');
const dateFilter = document.getElementById('date-filter');
const sourceFilter = document.getElementById('source-filter');
const concertGrid = document.getElementById('concert-grid');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('empty-state');
const resultsCount = document.getElementById('results-count');
const clearFiltersBtn = document.getElementById('clear-filters-btn');

// Now Playing DOM Elements
const nowPlayingBanner = document.getElementById('now-playing-banner');
const nowPlayingArtist = document.getElementById('now-playing-artist');
const nowPlayingDetails = document.getElementById('now-playing-details');
const nowPlayingTicketsBtn = document.getElementById('now-playing-btn-tickets');

// Month Names Helper
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Fetch Concert Data
async function fetchConcerts() {
  try {
    const response = await fetch('concerts.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    concerts = await response.json();
    
    // Sort concerts chronologically
    concerts.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    filteredConcerts = [...concerts];
    renderConcerts();
    
    // After rendering, if we already received a track event before the JSON loaded, trigger it now
    if (currentTrackId) {
      highlightConcertByTrackId(currentTrackId);
    }
  } catch (error) {
    console.error('Error fetching concert data:', error);
    loader.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: #ff527b; margin-bottom: 15px;"></i>
        <p>Failed to load upcoming concerts. Make sure the updater script has run successfully.</p>
      </div>
    `;
  }
}

// Format Date Helpers
function parseConcertDate(dateStr) {
  const dateObj = new Date(dateStr);
  return {
    month: MONTHS[dateObj.getMonth()],
    day: dateObj.getDate(),
    year: dateObj.getFullYear(),
    timeString: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    dateOnly: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
  };
}

// Render Concert Cards
function renderConcerts() {
  // Hide loader
  loader.style.display = 'none';

  // Clear existing cards (except loader)
  const cards = concertGrid.querySelectorAll('.concert-card');
  cards.forEach(card => card.remove());

  // Update count
  resultsCount.textContent = `Showing ${filteredConcerts.length} concert${filteredConcerts.length === 1 ? '' : 's'}`;

  // Toggle empty state
  if (filteredConcerts.length === 0) {
    emptyState.style.display = 'flex';
    return;
  } else {
    emptyState.style.display = 'none';
  }

  // Generate and insert cards
  filteredConcerts.forEach((concert, index) => {
    const { month, day, timeString } = parseConcertDate(concert.date);
    const hasTime = concert.date.includes('T') && !concert.date.endsWith('T00:00:00.000Z');
    
    const card = document.createElement('article');
    card.className = 'concert-card';
    // Store unique identifier on element to scroll/find easily
    card.setAttribute('data-artist-key', concert.artist.toLowerCase().trim());
    if (concert.trackIds) {
      card.setAttribute('data-track-ids', concert.trackIds.join(','));
    }
    
    const sourceClass = concert.source.toLowerCase().replace(/\s+/g, '-');
    const sourceBadge = concert.source === 'Santa Fe Reporter' ? 'SFR' : concert.source;
    
    const ticketButton = concert.ticketUrl 
      ? `<a href="${concert.ticketUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary"><i class="fa-solid fa-ticket"></i> Tickets</a>`
      : '';
      
    const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(concert.artist)}`;
    
    card.innerHTML = `
      <span class="source-tag ${sourceClass}">${sourceBadge}</span>
      <div class="card-top">
        <div class="date-badge">
          <span class="month">${month}</span>
          <span class="day">${day}</span>
        </div>
        <div class="time-venue-info">
          <span class="time-text">
            <i class="fa-regular fa-clock"></i> ${hasTime ? timeString : 'Time TBA'}
          </span>
          <span class="time-text">
            <i class="fa-regular fa-calendar"></i> ${new Date(concert.date).toLocaleDateString([], { weekday: 'short' })}
          </span>
        </div>
      </div>
      <h3 class="artist-title" title="${concert.artist}">${concert.artist}</h3>
      <div class="venue-info">
        <i class="fa-solid fa-location-dot"></i>
        <span>${concert.venue}</span>
      </div>
      <div class="card-actions">
        <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-spotify">
          <i class="fa-brands fa-spotify"></i> Listen
        </a>
        ${ticketButton}
      </div>
    `;
    
    concertGrid.appendChild(card);
  });

  // Re-apply currently playing highlight if a track is active
  if (currentTrackId) {
    highlightConcertByTrackId(currentTrackId);
  }
}

// Filter Logic
function applyFilters() {
  const searchQuery = searchInput.value.toLowerCase().trim();
  const dateVal = dateFilter.value;
  const sourceVal = sourceFilter.value;

  // Show/hide clear filters button
  if (searchQuery !== '' || dateVal !== 'all' || sourceVal !== 'all') {
    clearFiltersBtn.style.display = 'inline-block';
  } else {
    clearFiltersBtn.style.display = 'none';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  filteredConcerts = concerts.filter(concert => {
    // 1. Search Query Filter
    const matchesSearch = 
      concert.artist.toLowerCase().includes(searchQuery) ||
      concert.venue.toLowerCase().includes(searchQuery);

    // 2. Date Filter
    const concertDate = new Date(concert.date);
    concertDate.setHours(0, 0, 0, 0);
    
    let matchesDate = true;
    if (dateVal === 'today') {
      matchesDate = concertDate.getTime() === today.getTime();
    } else if (dateVal === 'week') {
      matchesDate = concertDate >= today && concertDate <= nextWeek;
    } else if (dateVal === 'month') {
      matchesDate = 
        concertDate.getMonth() === today.getMonth() && 
        concertDate.getFullYear() === today.getFullYear() &&
        concertDate >= today;
    }

    // 3. Source Filter
    const matchesSource = sourceVal === 'all' || concert.source === sourceVal;

    return matchesSearch && matchesDate && matchesSource;
  });

  renderConcerts();
}

// Clear Filters
function clearFilters() {
  searchInput.value = '';
  dateFilter.value = 'all';
  sourceFilter.value = 'all';
  applyFilters();
}

// Spotify IFrame API Callback
window.onSpotifyIframeApiReady = (IFrameAPI) => {
  const element = document.getElementById('spotify-embed-iframe');
  const options = {
    width: '100%',
    height: '480',
    uri: 'spotify:playlist:7IhapNTY8GMvqflSaVyQfP'
  };
  
  const callback = (EmbedController) => {
    embedController = EmbedController;
    console.log('Spotify Embed Controller Initialized.');

    // Listen for playback state updates
    EmbedController.addListener('playback_update', e => {
      const data = e.data;
      if (data && data.playingURI) {
        const trackUri = data.playingURI;
        const trackId = trackUri.split(':').pop();
        
        // Only trigger update if the track ID has changed
        if (currentTrackId !== trackId) {
          currentTrackId = trackId;
          console.log(`Now playing Spotify Track ID: ${trackId}`);
          
          if (data.isPaused) {
            clearHighlight();
          } else {
            highlightConcertByTrackId(trackId);
          }
        } else if (data.isPaused) {
          clearHighlight();
        } else {
          // Resume playing
          highlightConcertByTrackId(trackId);
        }
      } else {
        // No active playback
        clearHighlight();
      }
    });
  };
  
  IFrameAPI.createController(element, options, callback);
};

// Find and Highlight Concert by Spotify Track ID
function highlightConcertByTrackId(trackId) {
  // Clear any existing highlights
  document.querySelectorAll('.concert-card.currently-playing').forEach(el => {
    el.classList.remove('currently-playing');
  });

  if (!trackId) {
    clearHighlight();
    return;
  }

  // Find concert from state array
  const matchedConcert = concerts.find(c => c.trackIds && c.trackIds.includes(trackId));
  
  if (matchedConcert) {
    console.log(`Playback matched concert: "${matchedConcert.artist}"`);
    
    // 1. Update and show Now Playing banner
    const dateFormatted = new Date(matchedConcert.date).toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    
    nowPlayingArtist.textContent = matchedConcert.artist;
    nowPlayingDetails.textContent = `playing at ${matchedConcert.venue} on ${dateFormatted}`;
    
    if (matchedConcert.ticketUrl) {
      nowPlayingTicketsBtn.href = matchedConcert.ticketUrl;
      nowPlayingTicketsBtn.style.display = 'inline-flex';
    } else {
      nowPlayingTicketsBtn.style.display = 'none';
    }
    
    nowPlayingBanner.style.display = 'block';

    // 2. Highlight card on the grid if it's currently rendered
    const cardElement = Array.from(document.querySelectorAll('.concert-card')).find(el => {
      const trackIdsAttr = el.getAttribute('data-track-ids');
      return trackIdsAttr && trackIdsAttr.split(',').includes(trackId);
    });

    if (cardElement) {
      cardElement.classList.add('currently-playing');
      
      // Smoothly scroll the card into center view
      cardElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  } else {
    // Track is playing but not matched to a concert (e.g. ad, or other playlist item)
    clearHighlight();
  }
}

// Clear Highlights Helper
function clearHighlight() {
  nowPlayingBanner.style.display = 'none';
  document.querySelectorAll('.concert-card.currently-playing').forEach(el => {
    el.classList.remove('currently-playing');
  });
}

// Event Listeners
searchInput.addEventListener('input', applyFilters);
dateFilter.addEventListener('change', applyFilters);
sourceFilter.addEventListener('change', applyFilters);
clearFiltersBtn.addEventListener('click', clearFilters);

// Initial Fetch on Load
document.addEventListener('DOMContentLoaded', fetchConcerts);
