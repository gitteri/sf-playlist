// State Management
let rawConcerts = [];
let groupedConcerts = [];
let filteredConcerts = [];
let embedController = null;
let currentTrackId = null;
let activeShowGroup = null;

// Filter States
const activeFilters = {
  search: '',
  date: 'all',
  venue: 'all',
  genres: [] // Array of selected genre strings for multi-toggle
};

// DOM Elements
const searchInput = document.getElementById('search-input');
const venueFilter = document.getElementById('venue-filter');
const datePillsContainer = document.getElementById('date-pills');
const genrePillsContainer = document.getElementById('genre-pills');
const concertGrid = document.getElementById('concert-grid');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('empty-state');
const resultsCount = document.getElementById('results-count');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const emptyResetBtn = document.getElementById('empty-reset-btn');

// Playbar Elements
const bottomPlaybar = document.getElementById('bottom-playbar');
const playbarArtist = document.getElementById('playbar-artist');
const playbarVenue = document.getElementById('playbar-venue');
const playbarImg = document.getElementById('playbar-img');
const playbarTicketsBtn = document.getElementById('playbar-btn-tickets');
const playbarDetailsBtn = document.getElementById('playbar-btn-details');

// Modal Elements
const showModal = document.getElementById('show-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalTitle = document.getElementById('modal-title');
const modalVenueInfo = document.getElementById('modal-venue-info');
const modalDateString = document.getElementById('modal-date-string');
const modalHeaderBanner = document.getElementById('modal-header-banner');
const modalLineupList = document.getElementById('modal-lineup-list');
const modalDetailDate = document.getElementById('modal-detail-date');
const modalDetailTime = document.getElementById('modal-detail-time');
const modalDetailSources = document.getElementById('modal-detail-sources');
const modalTicketsBtn = document.getElementById('modal-btn-tickets');
const modalDirectionsBtn = document.getElementById('modal-btn-directions');

// Month Names Helper
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Fetch Concert Data
async function fetchConcerts() {
  try {
    const response = await fetch('concerts.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    rawConcerts = await response.json();
    
    // Sort raw concerts chronologically
    rawConcerts.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Group concerts by show (venue + date + ticketUrl)
    groupedConcerts = groupConcerts(rawConcerts);
    
    // Populate dynamic filters (venues, genres)
    populateVenueFilter();
    populateGenrePills();
    
    // Initial apply
    applyFilters();
    
    // After rendering, if we already received a track event before the JSON loaded, trigger it now
    if (currentTrackId) {
      highlightActiveConcertByTrack(currentTrackId);
    }
  } catch (error) {
    console.error('Error fetching concert data:', error);
    loader.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff527b;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; margin-bottom: 15px;"></i>
        <p style="font-weight: 600;">Failed to load upcoming concerts.</p>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 5px;">Make sure the updater script has finished running.</p>
      </div>
    `;
  }
}

// Group raw duplicate/co-headliner listings into unified shows
function groupConcerts(rawList) {
  const groups = [];
  
  rawList.forEach(item => {
    const itemDate = new Date(item.date);
    
    // Try to find a matching show group
    const matched = groups.find(g => {
      // 1. Same venue
      const sameVenue = g.venue.toLowerCase().trim() === item.venue.toLowerCase().trim();
      if (!sameVenue) return false;
      
      // 2. Same ticket URL
      if (item.ticketUrl && g.ticketUrl && item.ticketUrl === g.ticketUrl) {
        return true;
      }
      
      // 3. Close time (within 3 hours) on the same calendar day
      const gDate = new Date(g.date);
      const timeDiff = Math.abs(gDate.getTime() - itemDate.getTime());
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      return hoursDiff < 3;
    });
    
    // Determine this item's Spotify info
    const performerInfo = {
      name: item.artist,
      spotifyId: item.trackIds && item.trackIds.length > 0 ? true : false,
      artistImageUrl: item.artistImageUrl,
      genres: item.genres || [],
      trackIds: item.trackIds || []
    };
    
    if (matched) {
      // 1. Add performer if not already listed
      const exists = matched.performers.some(p => p.name.toLowerCase() === item.artist.toLowerCase());
      if (!exists) {
        matched.performers.push(performerInfo);
      }
      
      // 2. Combine track IDs
      if (item.trackIds) {
        matched.trackIds = [...new Set([...matched.trackIds, ...item.trackIds])];
      }
      
      // 3. Combine genres
      if (item.genres) {
        matched.genres = [...new Set([...matched.genres, ...item.genres])];
      }
      
      // 4. Update image if the group has none yet
      if (!matched.artistImageUrl && item.artistImageUrl) {
        matched.artistImageUrl = item.artistImageUrl;
      }
      
      // 5. Keep ticket link
      if (!matched.ticketUrl && item.ticketUrl) {
        matched.ticketUrl = item.ticketUrl;
      }
      
      // 6. Record source
      if (!matched.sources.includes(item.source)) {
        matched.sources.push(item.source);
      }
      
      // 7. Store sub-artists if this item brought any (co-headliners unpacked in scraping)
      if (item.subArtists) {
        item.subArtists.forEach(sub => {
          const subExists = matched.performers.some(p => p.name.toLowerCase() === sub.name.toLowerCase());
          if (!subExists) {
            matched.performers.push({
              name: sub.name,
              spotifyId: sub.spotifyId ? true : false,
              artistImageUrl: sub.artistImageUrl,
              genres: sub.genres || [],
              trackIds: [] // Scraper top tracks went into parent trackIds
            });
          }
          if (sub.genres) {
            matched.genres = [...new Set([...matched.genres, ...sub.genres])];
          }
        });
      }
    } else {
      // Create new show group
      const newGroup = {
        id: `show-${Math.random().toString(36).substr(2, 9)}`,
        artist: item.artist, // headliner
        venue: item.venue,
        date: item.date,
        ticketUrl: item.ticketUrl,
        artistImageUrl: item.artistImageUrl,
        trackIds: item.trackIds || [],
        genres: item.genres || [],
        sources: [item.source],
        performers: [performerInfo]
      };
      
      // Unpack subArtists if present
      if (item.subArtists) {
        item.subArtists.forEach(sub => {
          newGroup.performers.push({
            name: sub.name,
            spotifyId: sub.spotifyId ? true : false,
            artistImageUrl: sub.artistImageUrl,
            genres: sub.genres || [],
            trackIds: []
          });
          if (sub.genres) {
            newGroup.genres = [...new Set([...newGroup.genres, ...sub.genres])];
          }
        });
      }
      
      groups.push(newGroup);
    }
  });
  
  return groups;
}

// Populate Venue Dropdown Options
function populateVenueFilter() {
  const venues = [...new Set(groupedConcerts.map(g => g.venue))].sort();
  
  // Clear extra options
  venueFilter.innerHTML = '<option value="all">All Venues</option>';
  
  venues.forEach(venue => {
    const option = document.createElement('option');
    option.value = venue;
    option.textContent = venue;
    venueFilter.appendChild(option);
  });
}

// Extract and Populate Genre Filter Pills
function populateGenrePills() {
  const genreCounts = {};
  
  // Count genres
  groupedConcerts.forEach(g => {
    if (g.genres) {
      g.genres.forEach(genre => {
        const lower = genre.toLowerCase().trim();
        // Ignore generic genres to keep the filter relevant
        if (['rock', 'pop', 'indie', 'folk', 'singer-songwriter', 'alternative', 'country', 'bluegrass', 'jazz', 'blues', 'punk', 'electronic', 'americana', 'hip hop', 'soul', 'metal'].includes(lower) || lower.length > 2) {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        }
      });
    }
  });
  
  // Sort genres by frequency
  const sortedGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]);
  
  // Select top 16 genres
  const topGenres = sortedGenres.slice(0, 16);
  
  genrePillsContainer.innerHTML = '';
  
  topGenres.forEach(genre => {
    const button = document.createElement('button');
    button.className = 'pill';
    button.setAttribute('data-genre', genre);
    button.textContent = `${genre.charAt(0).toUpperCase() + genre.slice(1)} (${genreCounts[genre]})`;
    
    button.addEventListener('click', () => {
      toggleGenreFilter(genre, button);
    });
    
    genrePillsContainer.appendChild(button);
  });
}

// Toggle Genre selection in filters
function toggleGenreFilter(genre, buttonElement) {
  const idx = activeFilters.genres.indexOf(genre);
  if (idx > -1) {
    activeFilters.genres.splice(idx, 1);
    buttonElement.classList.remove('active');
  } else {
    activeFilters.genres.push(genre);
    buttonElement.classList.add('active');
  }
  applyFilters();
}

// Parse Date Helper
function parseConcertDate(dateStr) {
  const dateObj = new Date(dateStr);
  return {
    month: MONTHS[dateObj.getMonth()],
    day: dateObj.getDate(),
    year: dateObj.getFullYear(),
    timeString: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    weekday: dateObj.toLocaleDateString([], { weekday: 'short' }),
    dateOnly: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
  };
}

// Render Grouped Concerts Grid
function renderConcerts() {
  // Hide loader
  loader.style.display = 'none';
  
  // Clear grid
  const cards = concertGrid.querySelectorAll('.concert-card');
  cards.forEach(card => card.remove());
  
  // Update count indicator
  resultsCount.textContent = `Showing ${filteredConcerts.length} concert show${filteredConcerts.length === 1 ? '' : 's'}`;
  
  // Show / Hide empty state
  if (filteredConcerts.length === 0) {
    emptyState.style.display = 'flex';
    return;
  } else {
    emptyState.style.display = 'none';
  }
  
  filteredConcerts.forEach(show => {
    const { month, day, timeString, weekday } = parseConcertDate(show.date);
    const hasTime = show.date.includes('T') && !show.date.endsWith('T00:00:00.000Z');
    
    // Create card element
    const card = document.createElement('article');
    card.className = 'concert-card';
    card.setAttribute('data-show-id', show.id);
    if (show.trackIds && show.trackIds.length > 0) {
      card.setAttribute('data-track-ids', show.trackIds.join(','));
    }
    
    // Generate co-headliners/support tag text
    let supportText = '';
    if (show.performers.length > 1) {
      const coActs = show.performers.slice(1).map(p => p.name);
      supportText = `<p class="co-headliners-subtext" title="w/ ${coActs.join(', ')}">w/ ${coActs.join(', ')}</p>`;
    }
    
    // Generate genre tag HTML (first 2 genres)
    let genreTagsHtml = '';
    if (show.genres && show.genres.length > 0) {
      genreTagsHtml = `
        <div class="card-genre-tags">
          ${show.genres.slice(0, 2).map(g => `<span class="card-genre-tag">${g}</span>`).join('')}
        </div>
      `;
    }
    
    // Source Badges
    const sourcesLabel = show.sources.map(s => s === 'Santa Fe Reporter' ? 'SFR' : s).join(' + ');
    
    // Card structure
    card.innerHTML = `
      <div class="card-bg-image" ${show.artistImageUrl ? `style="background-image: url('${show.artistImageUrl}')"` : ''}></div>
      <div class="card-overlay"></div>
      
      <div class="card-content">
        <div class="card-top-row">
          <div class="date-badge">
            <span class="month">${month}</span>
            <span class="day">${day}</span>
          </div>
          <span class="source-icon-badge">${sourcesLabel}</span>
        </div>
        
        ${show.trackIds && show.trackIds.length > 0 ? `
          <button class="card-play-btn" aria-label="Listen preview" onclick="event.stopPropagation(); playShowTracks('${show.id}');">
            <i class="fa-solid fa-play"></i>
          </button>
        ` : ''}
        
        <div class="card-bottom-info">
          <div class="time-venue-row">
            <span><i class="fa-regular fa-clock"></i> ${hasTime ? timeString : 'TBA'}</span>
            <span><i class="fa-regular fa-calendar"></i> ${weekday}</span>
          </div>
          <h3 class="card-artist-title" title="${show.artist}">${show.artist}</h3>
          ${supportText}
          <div class="card-venue" style="font-size: 0.85rem; font-weight: 500; margin-top: 2px;">
            <i class="fa-solid fa-location-dot"></i> <span>${show.venue}</span>
          </div>
          ${genreTagsHtml}
        </div>
      </div>
    `;
    
    // Card click events (open details modal)
    card.addEventListener('click', () => {
      openShowDetailsModal(show);
    });
    
    concertGrid.appendChild(card);
  });
  
  // Re-apply currently playing class
  if (currentTrackId) {
    highlightActiveConcertByTrack(currentTrackId);
  }
}

// Filter Logic
function applyFilters() {
  const searchQuery = activeFilters.search.toLowerCase().trim();
  const dateVal = activeFilters.date;
  const venueVal = activeFilters.venue;
  const genresVal = activeFilters.genres;
  
  // Toggle reset button
  if (searchQuery !== '' || dateVal !== 'all' || venueVal !== 'all' || genresVal.length > 0) {
    clearFiltersBtn.style.display = 'inline-flex';
  } else {
    clearFiltersBtn.style.display = 'none';
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  filteredConcerts = groupedConcerts.filter(show => {
    // 1. Search filter (match headliner, support performers, venue, or genres)
    const performerMatch = show.performers.some(p => p.name.toLowerCase().includes(searchQuery));
    const genreMatchText = show.genres ? show.genres.some(g => g.toLowerCase().includes(searchQuery)) : false;
    const venueMatchText = show.venue.toLowerCase().includes(searchQuery);
    const matchesSearch = searchQuery === '' || performerMatch || genreMatchText || venueMatchText;
    
    // 2. Venue filter
    const matchesVenue = venueVal === 'all' || show.venue === venueVal;
    
    // 3. Date filter
    const showDate = new Date(show.date);
    showDate.setHours(0, 0, 0, 0);
    
    let matchesDate = true;
    if (dateVal === 'today') {
      matchesDate = showDate.getTime() === today.getTime();
    } else if (dateVal === 'week') {
      matchesDate = showDate >= today && showDate <= nextWeek;
    } else if (dateVal === 'month') {
      matchesDate = 
        showDate.getMonth() === today.getMonth() && 
        showDate.getFullYear() === today.getFullYear() &&
        showDate >= today;
    }
    
    // 4. Genre Pills Filter (AND logic - must match all active pills, or OR logic - match any. Let's do OR/Any match for ease)
    let matchesGenres = true;
    if (genresVal.length > 0) {
      matchesGenres = show.genres ? show.genres.some(g => genresVal.includes(g)) : false;
    }
    
    return matchesSearch && matchesVenue && matchesDate && matchesGenres;
  });
  
  renderConcerts();
}

// Reset all active filters
function clearFilters() {
  // Clear search input
  searchInput.value = '';
  activeFilters.search = '';
  
  // Reset venue filter
  venueFilter.value = 'all';
  activeFilters.venue = 'all';
  
  // Reset date pills
  activeFilters.date = 'all';
  document.querySelectorAll('#date-pills .pill').forEach(btn => {
    if (btn.getAttribute('data-value') === 'all') {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Reset genre pills
  activeFilters.genres = [];
  document.querySelectorAll('#genre-pills .pill').forEach(btn => {
    btn.classList.remove('active');
  });
  
  applyFilters();
}

// Play Tracks for a Unified Show Group
function playShowTracks(showId) {
  const show = groupedConcerts.find(g => g.id === showId);
  if (show && show.trackIds && show.trackIds.length > 0) {
    playTrackOnSpotify(show.trackIds[0]);
  }
}

// Play a specific track URI inside the Spotify embed iframe
function playTrackOnSpotify(trackId) {
  if (embedController && trackId) {
    console.log(`Commanding Spotify Player to play: ${trackId}`);
    embedController.loadUri(`spotify:track:${trackId}`);
  } else {
    console.warn('Spotify Embed controller is not ready or trackId is missing');
  }
}

// Show details in Modal
function openShowDetailsModal(show) {
  activeShowGroup = show;
  
  // Date format
  const dateObj = new Date(show.date);
  const formattedDate = dateObj.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
  const formattedTime = show.date.includes('T') && !show.date.endsWith('T00:00:00.000Z')
    ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Time TBA';
    
  // Headline banner
  modalTitle.textContent = show.artist;
  modalVenueInfo.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${show.venue}`;
  modalDateString.textContent = formattedDate;
  
  if (show.artistImageUrl) {
    modalHeaderBanner.style.backgroundImage = `url('${show.artistImageUrl}')`;
  } else {
    modalHeaderBanner.style.backgroundImage = "linear-gradient(135deg, #1f1f2e 0%, #0d0d13 100%)";
  }
  
  // Sidebar info
  modalDetailDate.textContent = dateObj.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  modalDetailTime.textContent = formattedTime;
  modalDetailSources.textContent = show.sources.join(', ');
  
  // Action Buttons
  if (show.ticketUrl) {
    modalTicketsBtn.href = show.ticketUrl;
    modalTicketsBtn.style.display = 'inline-flex';
  } else {
    modalTicketsBtn.style.display = 'none';
  }
  
  // Get Directions link
  modalDirectionsBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(show.venue + ' Santa Fe NM')}`;
  
  // Render performers lineup
  modalLineupList.innerHTML = '';
  
  show.performers.forEach(perf => {
    const card = document.createElement('div');
    card.className = 'performer-card';
    
    // Genres HTML
    let genresHtml = '';
    if (perf.genres && perf.genres.length > 0) {
      genresHtml = `
        <div class="performer-genres">
          ${perf.genres.slice(0, 3).map(g => `<span class="performer-genre-tag">${g}</span>`).join('')}
        </div>
      `;
    }
    
    // Check if artist has playable tracks
    let listenButtonHtml = '';
    if (perf.trackIds && perf.trackIds.length > 0) {
      listenButtonHtml = `
        <button class="performer-play-btn" aria-label="Listen artist track" onclick="playTrackOnSpotify('${perf.trackIds[0]}')">
          <i class="fa-solid fa-play"></i>
        </button>
      `;
    } else if (show.trackIds && show.trackIds.length > 0 && perf.name.toLowerCase() === show.artist.toLowerCase()) {
      // Main artist fallback to combined show tracks
      listenButtonHtml = `
        <button class="performer-play-btn" aria-label="Listen artist track" onclick="playTrackOnSpotify('${show.trackIds[0]}')">
          <i class="fa-solid fa-play"></i>
        </button>
      `;
    }
    
    card.innerHTML = `
      <div class="performer-avatar" ${perf.artistImageUrl ? `style="background-image: url('${perf.artistImageUrl}')"` : ''}></div>
      <div class="performer-info">
        <h4 class="performer-name">${perf.name}</h4>
        ${genresHtml}
      </div>
      ${listenButtonHtml}
    `;
    
    modalLineupList.appendChild(card);
  });
  
  // Display modal overlay
  showModal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Lock background scroll
}

// Close Modal helper
function closeModal() {
  showModal.style.display = 'none';
  document.body.style.overflow = ''; // Unlock background scroll
}

// Spotify IFrame API Callback hook
window.onSpotifyIframeApiReady = (IFrameAPI) => {
  const element = document.getElementById('spotify-embed-iframe');
  const options = {
    width: '100%',
    height: '380',
    uri: 'spotify:playlist:7IhapNTY8GMvqflSaVyQfP'
  };
  
  const callback = (EmbedController) => {
    embedController = EmbedController;
    console.log('Spotify Embed Controller initialized successfully.');
    
    // Listen for playback state changes
    EmbedController.addListener('playback_update', e => {
      const data = e.data;
      if (data && data.playingURI) {
        const trackUri = data.playingURI;
        const trackId = trackUri.split(':').pop();
        
        if (currentTrackId !== trackId) {
          currentTrackId = trackId;
          console.log(`Playback event, track ID: ${trackId}`);
          
          if (data.isPaused) {
            clearHighlightState();
          } else {
            highlightActiveConcertByTrack(trackId);
          }
        } else if (data.isPaused) {
          clearHighlightState();
        } else {
          highlightActiveConcertByTrack(trackId);
        }
      } else {
        clearHighlightState();
      }
    });
  };
  
  IFrameAPI.createController(element, options, callback);
};

// Find and highlight active concert card on the page based on playing track ID
function highlightActiveConcertByTrack(trackId) {
  // Clear any existing highlighted card classes
  document.querySelectorAll('.concert-card.currently-playing').forEach(el => {
    el.classList.remove('currently-playing');
  });
  
  if (!trackId) {
    clearHighlightState();
    return;
  }
  
  // Find concert from the grouped concerts
  const matchedShow = groupedConcerts.find(g => g.trackIds && g.trackIds.includes(trackId));
  
  if (matchedShow) {
    console.log(`Track match found! Active event: "${matchedShow.artist}"`);
    activeShowGroup = matchedShow;
    
    // 1. Update bottom playbar details
    playbarArtist.textContent = matchedShow.artist;
    
    const dateFormatted = new Date(matchedShow.date).toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    playbarVenue.textContent = `${matchedShow.venue} • ${dateFormatted}`;
    
    if (matchedShow.artistImageUrl) {
      playbarImg.style.backgroundImage = `url('${matchedShow.artistImageUrl}')`;
    } else {
      playbarImg.style.backgroundImage = 'none';
    }
    
    // 2. Playbar Actions
    if (matchedShow.ticketUrl) {
      playbarTicketsBtn.href = matchedShow.ticketUrl;
      playbarTicketsBtn.style.display = 'inline-flex';
    } else {
      playbarTicketsBtn.style.display = 'none';
    }
    
    // Show playbar
    bottomPlaybar.classList.add('active');
    
    // 3. Highlight grid card element
    const cardElement = Array.from(document.querySelectorAll('.concert-card')).find(el => {
      const showId = el.getAttribute('data-show-id');
      return showId === matchedShow.id;
    });
    
    if (cardElement) {
      cardElement.classList.add('currently-playing');
      
      // Scroll to it smoothly if not currently in view
      cardElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  } else {
    // Active track does not belong to any upcoming show
    clearHighlightState();
  }
}

// Dismiss bottom playbar and card highlights
function clearHighlightState() {
  bottomPlaybar.classList.remove('active');
  document.querySelectorAll('.concert-card.currently-playing').forEach(el => {
    el.classList.remove('currently-playing');
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // Input search
  searchInput.addEventListener('input', (e) => {
    activeFilters.search = e.target.value;
    applyFilters();
  });
  
  // Venue Select Dropdown
  venueFilter.addEventListener('change', (e) => {
    activeFilters.venue = e.target.value;
    applyFilters();
  });
  
  // Date pills toggle
  datePillsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (btn) {
      // Deactivate all date pills
      datePillsContainer.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      
      // Activate clicked
      btn.classList.add('active');
      activeFilters.date = btn.getAttribute('data-value');
      applyFilters();
    }
  });
  
  // Reset buttons
  clearFiltersBtn.addEventListener('click', clearFilters);
  emptyResetBtn.addEventListener('click', clearFilters);
  
  // Modal close trigger
  closeModalBtn.addEventListener('click', closeModal);
  showModal.addEventListener('click', (e) => {
    if (e.target === showModal) {
      closeModal();
    }
  });
  
  // Keyboard ESC to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });
  
  // Playbar details click handler
  playbarDetailsBtn.addEventListener('click', () => {
    if (activeShowGroup) {
      openShowDetailsModal(activeShowGroup);
    }
  });
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchConcerts();
});
