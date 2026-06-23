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

// Major Genre Classification Maps
const GENRE_MAP = {
  'Rock / Alternative': [
    'rock', 'indie', 'alternative', 'punk', 'metal', 'grunge', 'post-punk', 'shoegaze', 'surf', 'garage', 'psych', 'hardcore', 'fuzz', 'noise', 'emo'
  ],
  'Folk / Country / Bluegrass': [
    'folk', 'country', 'bluegrass', 'americana', 'red dirt', 'alt-country', 'alt country', 'singer-songwriter', 'singer/songwriter', 'acoustic', 'traditional', 'western', 'roots', 'cowboy', 'banjo', 'fiddle', 'songwriter', 'honky tonk', 'honky-tonk'
  ],
  'Jazz / Blues / Funk': [
    'jazz', 'blues', 'funk', 'soul', 'r&b', 'gospel', 'swing', 'fusion', 'motown', 'brass', 'big band', 'groove', 'trio'
  ],
  'Electronic / EDM / DJ': [
    'edm', 'electronic', 'techno', 'house', 'dance', 'dj', 'remix', 'vinyl', 'beats', 'synth', 'disco', 'trance', 'dubstep', 'rave', 'mix', 'electro'
  ],
  'Hip Hop / Rap': [
    'hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'boom bap'
  ],
  'Pop': [
    'pop', 'synthpop', 'pop rap'
  ],
  'Reggae / Latin / World': [
    'reggae', 'ska', 'cumbia', 'cumbiero', 'latin', 'mariachi', 'salsa', 'world', 'afrobeat', 'flamenco', 'folklorico', 'bossa nova', 'mexican', 'spanish', 'tejano', 'norteno', 'corridos', 'ranchera', 'reggaeton'
  ],
  'Classical': [
    'classical', 'orchestra', 'symphony', 'string', 'chamber', 'opera', 'baroque', 'choral', 'quartet', 'quintet', 'cello', 'violin', 'flute'
  ]
};

// DOM Elements (assigned on init)
let searchInput;
let venueFilter;
let datePillsContainer;
let genrePillsContainer;
let concertGrid;
let loader;
let emptyState;
let resultsCount;
let clearFiltersBtn;
let emptyResetBtn;
let loadPlaylistBtn;

// Playbar Elements
let bottomPlaybar;
let playbarArtist;
let playbarVenue;
let playbarImg;
let playbarTicketsBtn;
let playbarDetailsBtn;

// Modal Elements
let showModal;
let closeModalBtn;
let modalTitle;
let modalVenueInfo;
let modalDateString;
let modalHeaderBanner;
let modalLineupList;
let modalDetailDate;
let modalDetailTime;
let modalDetailSources;
let modalTicketsBtn;
let modalListingBtn;
let modalShareBtn;
let modalHeaderPlayBtn;
let modalDirectionsBtn;
let modalDescriptionContainer;
let modalDescription;
let isResettingPlayer = false;

// Month Names Helper
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Generate deterministic premium gradients for placeholders based on string hashing
function getDeterministicGradient(str) {
  const gradients = [
    'linear-gradient(135deg, #0d6b2c 0%, #1db954 100%)', // Spotify Green
    'linear-gradient(135deg, #3c096c 0%, #7b2cbf 100%)', // Deep Purple
    'linear-gradient(135deg, #b91d47 0%, #ff527b 100%)', // Neon Pink
    'linear-gradient(135deg, #162447 0%, #1f4068 100%)', // Midnight Blue
    'linear-gradient(135deg, #dc2f02 0%, #e85d04 100%)', // Vibrant Orange
    'linear-gradient(135deg, #0077b6 0%, #00b4d8 100%)'  // Bright Teal
  ];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

// Map raw Spotify sub-genres & keywords to major categories
function getMajorGenres(show) {
  const majorGenres = new Set();
  
  if (show.genres && show.genres.length > 0) {
    show.genres.forEach(g => {
      const lower = g.toLowerCase();
      
      // Direct category name check
      for (const major of Object.keys(GENRE_MAP)) {
        if (lower === major.toLowerCase()) {
          majorGenres.add(major);
        }
      }
      
      for (const [major, keywords] of Object.entries(GENRE_MAP)) {
        const matches = keywords.some(keyword => lower.includes(keyword));
        if (matches) {
          majorGenres.add(major);
        }
      }
    });
  }
  
  // Fallbacks if no major genres matched or if there are no genres
  if (majorGenres.size === 0) {
    const textToScan = `${show.artist} ${show.venue} ${show.description || ''}`.toLowerCase();
    
    if (textToScan.includes('string') || textToScan.includes('quartet') || textToScan.includes('classical') || textToScan.includes('baroque') || textToScan.includes('quintet') || textToScan.includes('orchestra') || textToScan.includes('symphony') || textToScan.includes('chamber') || textToScan.includes('opera')) {
      majorGenres.add('Classical');
    } else if (textToScan.includes('reggae') || textToScan.includes('ska') || textToScan.includes('cumbia') || textToScan.includes('latin') || textToScan.includes('mariachi') || textToScan.includes('salsa') || textToScan.includes('flamenco') || textToScan.includes('world') || textToScan.includes('afrobeat')) {
      majorGenres.add('Reggae / Latin / World');
    } else if (textToScan.includes('blues') || textToScan.includes('jazz') || textToScan.includes('funk') || textToScan.includes('soul') || textToScan.includes('brass') || textToScan.includes('trio')) {
      majorGenres.add('Jazz / Blues / Funk');
    } else if (textToScan.includes('bluegrass') || textToScan.includes('country') || textToScan.includes('folk') || textToScan.includes('acoustic') || textToScan.includes('traditional') || textToScan.includes('western') || textToScan.includes('roots') || textToScan.includes('americana') || textToScan.includes('grass')) {
      majorGenres.add('Folk / Country / Bluegrass');
    } else if (textToScan.includes('rock') || textToScan.includes('metal') || textToScan.includes('punk') || textToScan.includes('indie')) {
      majorGenres.add('Rock / Alternative');
    } else if (textToScan.includes('dj') || textToScan.includes('electronic') || textToScan.includes('edm') || textToScan.includes('dance') || textToScan.includes('disco') || textToScan.includes('rave') || textToScan.includes('remix') || textToScan.includes('vinyl') || textToScan.includes('beats')) {
      majorGenres.add('Electronic / EDM / DJ');
    } else if (textToScan.includes('rap') || textToScan.includes('hip-hop') || textToScan.includes('hip hop') || textToScan.includes('trap')) {
      majorGenres.add('Hip Hop / Rap');
    } else if (textToScan.includes('pop')) {
      majorGenres.add('Pop');
    } else {
      majorGenres.add('Other');
    }
  }
  
  return Array.from(majorGenres);
}

// Initialize DOM elements and check ready state
function init() {
  // Query all DOM elements
  searchInput = document.getElementById('search-input');
  venueFilter = document.getElementById('venue-filter');
  datePillsContainer = document.getElementById('date-pills');
  genrePillsContainer = document.getElementById('genre-pills');
  concertGrid = document.getElementById('concert-grid');
  loader = document.getElementById('loader');
  emptyState = document.getElementById('empty-state');
  resultsCount = document.getElementById('results-count');
  clearFiltersBtn = document.getElementById('clear-filters-btn');
  emptyResetBtn = document.getElementById('empty-reset-btn');
  loadPlaylistBtn = document.getElementById('btn-load-playlist');

  bottomPlaybar = document.getElementById('bottom-playbar');
  playbarArtist = document.getElementById('playbar-artist');
  playbarVenue = document.getElementById('playbar-venue');
  playbarImg = document.getElementById('playbar-img');
  playbarTicketsBtn = document.getElementById('playbar-btn-tickets');
  playbarDetailsBtn = document.getElementById('playbar-btn-details');

  showModal = document.getElementById('show-modal');
  closeModalBtn = document.getElementById('close-modal-btn');
  modalTitle = document.getElementById('modal-title');
  modalVenueInfo = document.getElementById('modal-venue-info');
  modalDateString = document.getElementById('modal-date-string');
  modalHeaderBanner = document.getElementById('modal-header-banner');
  modalLineupList = document.getElementById('modal-lineup-list');
  modalDetailDate = document.getElementById('modal-detail-date');
  modalDetailTime = document.getElementById('modal-detail-time');
  modalDetailSources = document.getElementById('modal-detail-sources');
  modalTicketsBtn = document.getElementById('modal-btn-tickets');
  modalListingBtn = document.getElementById('modal-btn-listing');
  modalShareBtn = document.getElementById('modal-btn-share');
  modalHeaderPlayBtn = document.getElementById('modal-header-play-btn');
  modalDirectionsBtn = document.getElementById('modal-btn-directions');
  modalDescriptionContainer = document.getElementById('modal-description-container');
  modalDescription = document.getElementById('modal-description');

  setupEventListeners();
  fetchConcerts();
  loadSpotifyPlayerAPI();
}

// Dynamically load the Spotify Player script to ensure no race conditions
function loadSpotifyPlayerAPI() {
  if (document.querySelector('script[src="https://open.spotify.com/embed/iframe-api/v1"]')) {
    return;
  }
  const script = document.createElement('script');
  script.src = "https://open.spotify.com/embed/iframe-api/v1";
  script.async = true;
  document.body.appendChild(script);
}

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
    
    // Check if direct link hash is present
    checkUrlHash();
    
    // After rendering, if we already received a track event before the JSON loaded, trigger it now
    if (currentTrackId) {
      highlightActiveConcertByTrack(currentTrackId, true);
    }
  } catch (error) {
    console.error('Error fetching concert data:', error);
    if (loader) {
      loader.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #ff527b;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; margin-bottom: 15px;"></i>
          <p style="font-weight: 600;">Failed to load upcoming concerts.</p>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 5px;">Make sure the updater script has finished running.</p>
        </div>
      `;
    }
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
    
    const hasSubArtists = item.subArtists && item.subArtists.length > 0;
    const isRealPerformer = item.spotifyId || !hasSubArtists;
    
    if (matched) {
      // 1. Add performer if not already listed and is a real performer (not a festival name)
      if (isRealPerformer) {
        const exists = matched.performers.some(p => p.name.toLowerCase() === item.artist.toLowerCase());
        if (!exists) {
          matched.performers.push(performerInfo);
        }
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
      
      // Keep listing link
      if (!matched.listingUrl && item.listingUrl) {
        matched.listingUrl = item.listingUrl;
      }
      
      // Keep description if not already present
      if (!matched.description && item.description) {
        matched.description = item.description;
      }
      
      // Keep source event details for deep linking
      if (!matched.sourceEventId && item.sourceEventId) {
        matched.sourceEventId = item.sourceEventId;
      }
      if (!matched.sourceEventSlug && item.sourceEventSlug) {
        matched.sourceEventSlug = item.sourceEventSlug;
      }
      
      // 6. Record source
      if (!matched.sources.includes(item.source)) {
        matched.sources.push(item.source);
      }
      
      // 7. Store sub-artists if this item brought any
      if (item.subArtists) {
        item.subArtists.forEach(sub => {
          const subExists = matched.performers.some(p => p.name.toLowerCase() === sub.name.toLowerCase());
          if (!subExists) {
            matched.performers.push({
              name: sub.name,
              spotifyId: sub.spotifyId ? true : false,
              artistImageUrl: sub.artistImageUrl,
              genres: sub.genres || [],
              trackIds: sub.trackIds || []
            });
          }
          if (sub.genres) {
            matched.genres = [...new Set([...matched.genres, ...sub.genres])];
          }
        });
      }
    } else {
      // Create a stable deterministic ID based on headliner name, venue, and date
      const cleanArtist = item.artist.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
      const cleanVenue = item.venue.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
      const showTime = new Date(item.date).getTime();
      const showId = `show-${cleanArtist}-${cleanVenue}-${showTime}`;

      // Create new show group
      const newGroup = {
        id: showId,
        artist: item.artist, // headliner
        venue: item.venue,
        date: item.date,
        description: item.description,
        ticketUrl: item.ticketUrl,
        listingUrl: item.listingUrl,
        sourceEventId: item.sourceEventId,
        sourceEventSlug: item.sourceEventSlug,
        artistImageUrl: item.artistImageUrl,
        trackIds: item.trackIds || [],
        genres: item.genres || [],
        sources: [item.source],
        performers: []
      };
      
      // Only push headliner if it's a real performer
      if (isRealPerformer) {
        newGroup.performers.push(performerInfo);
      }
      
      // Unpack subArtists if present
      if (item.subArtists) {
        item.subArtists.forEach(sub => {
          const subExists = newGroup.performers.some(p => p.name.toLowerCase() === sub.name.toLowerCase());
          if (!subExists) {
            newGroup.performers.push({
              name: sub.name,
              spotifyId: sub.spotifyId ? true : false,
              artistImageUrl: sub.artistImageUrl,
              genres: sub.genres || [],
              trackIds: sub.trackIds || []
            });
          }
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
  if (!venueFilter) return;
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

// Extract and Populate Genre Filter Pills (using Mapped Major Categories)
function populateGenrePills() {
  if (!genrePillsContainer) return;
  
  // Mapped categories with their icons
  const categories = [
    { name: 'Rock / Alternative', icon: 'fa-guitar' },
    { name: 'Folk / Country / Bluegrass', icon: 'fa-mountain' },
    { name: 'Jazz / Blues / Funk', icon: 'fa-music' },
    { name: 'Electronic / EDM / DJ', icon: 'fa-headphones' },
    { name: 'Hip Hop / Rap', icon: 'fa-microphone' },
    { name: 'Pop', icon: 'fa-star' },
    { name: 'Reggae / Latin / World', icon: 'fa-globe' },
    { name: 'Classical', icon: 'fa-landmark' },
    { name: 'Other', icon: 'fa-compact-disc' }
  ];
  
  genrePillsContainer.innerHTML = '';
  
  categories.forEach(cat => {
    // Count shows matching all non-genre filters + this specific genre
    const count = groupedConcerts.filter(show => {
      const matchesOthers = checkShowMatch(show, true);
      const majors = getMajorGenres(show);
      return matchesOthers && majors.includes(cat.name);
    }).length;
    
    // Show the genre pill if count > 0 OR if it's currently selected as an active filter
    if (count > 0 || activeFilters.genres.includes(cat.name)) {
      const button = document.createElement('button');
      button.className = 'pill';
      button.setAttribute('data-genre', cat.name);
      button.innerHTML = `<i class="fa-solid ${cat.icon}" style="margin-right: 6px; font-size: 0.8rem;"></i>${cat.name.split(' / ')[0]} (${count})`;
      
      // Highlight if active
      if (activeFilters.genres.includes(cat.name)) {
        button.classList.add('active');
      }
      
      button.addEventListener('click', () => {
        toggleGenreFilter(cat.name, button);
      });
      
      genrePillsContainer.appendChild(button);
    }
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
  if (!concertGrid) return;

  // Hide loader
  if (loader) loader.style.display = 'none';
  
  // Clear grid
  const cards = concertGrid.querySelectorAll('.concert-card');
  cards.forEach(card => card.remove());
  
  // Update count indicator
  if (resultsCount) {
    resultsCount.textContent = `Showing ${filteredConcerts.length} concert show${filteredConcerts.length === 1 ? '' : 's'}`;
  }
  
  // Show / Hide empty state
  if (filteredConcerts.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    return;
  } else {
    if (emptyState) emptyState.style.display = 'none';
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
    const isFestival = !show.performers.some(p => p.name.toLowerCase() === show.artist.toLowerCase());
    if (isFestival && show.performers.length > 0) {
      const acts = show.performers.map(p => p.name);
      supportText = `<p class="co-headliners-subtext" title="${acts.join(', ')}">${acts.join(', ')}</p>`;
    } else if (show.performers.length > 1) {
      const coActs = show.performers.slice(1).map(p => p.name);
      supportText = `<p class="co-headliners-subtext" title="w/ ${coActs.join(', ')}">w/ ${coActs.join(', ')}</p>`;
    }
    
    // Generate genre tag HTML using the clean major genre categories
    let genreTagsHtml = '';
    const showMajorGenres = getMajorGenres(show);
    if (showMajorGenres && showMajorGenres.length > 0) {
      genreTagsHtml = `
        <div class="card-genre-tags">
          ${showMajorGenres.slice(0, 2).map(g => `<span class="card-genre-tag">${g.split(' / ')[0]}</span>`).join('')}
        </div>
      `;
    }
    
    // Source Badges
    const sourcesLabel = show.sources.map(s => s === 'Santa Fe Reporter' ? 'SFR' : s).join(' + ');
    
    const cardGradient = getDeterministicGradient(show.artist);
    
    // Card structure
    card.innerHTML = `
      <div class="card-bg-image" ${show.artistImageUrl ? `style="background-image: url('${show.artistImageUrl}')"` : `style="background-image: ${cardGradient}"`}>
        ${!show.artistImageUrl ? `<div class="card-bg-placeholder"><i class="fa-solid fa-music"></i></div>` : ''}
      </div>
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
          <button class="card-play-btn" aria-label="Listen preview">
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
    
    // Play button click events (DOM listener to preserve user gesture context)
    const playBtn = card.querySelector('.card-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playShowTracks(show.id);
      });
    }
    
    concertGrid.appendChild(card);
  });
  
  // Re-apply currently playing class
  if (currentTrackId) {
    highlightActiveConcertByTrack(currentTrackId);
  }
}

// Helper to check if a show matches current filters
function checkShowMatch(show, excludeGenreFilter = false) {
  const searchQuery = activeFilters.search.toLowerCase().trim();
  const dateVal = activeFilters.date;
  const venueVal = activeFilters.venue;
  const genresVal = activeFilters.genres;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  // 1. Search filter (match artist name, performer name, genre list, specific performer genre, description, or venue)
  const performerMatch = show.artist.toLowerCase().includes(searchQuery) || 
                         show.performers.some(p => p.name.toLowerCase().includes(searchQuery));
  
  const genreMatchText = (show.genres && show.genres.some(g => g.toLowerCase().includes(searchQuery))) || 
                         show.performers.some(p => p.genres && p.genres.some(g => g.toLowerCase().includes(searchQuery)));
  
  const descriptionMatch = show.description ? show.description.toLowerCase().includes(searchQuery) : false;
  const venueMatchText = show.venue.toLowerCase().includes(searchQuery);
  const matchesSearch = searchQuery === '' || performerMatch || genreMatchText || descriptionMatch || venueMatchText;
  
  // 2. Venue filter
  const matchesVenue = venueVal === 'all' || show.venue === venueVal;
  
  // 3. Date filter (Always filter out past shows, showing only today and later)
  const showDate = new Date(show.date);
  showDate.setHours(0, 0, 0, 0);
  
  let matchesDate = showDate >= today;
  if (matchesDate) {
    if (dateVal === 'today') {
      matchesDate = showDate.getTime() === today.getTime();
    } else if (dateVal === 'week') {
      matchesDate = showDate <= nextWeek;
    } else if (dateVal === 'month') {
      matchesDate = 
        showDate.getMonth() === today.getMonth() && 
        showDate.getFullYear() === today.getFullYear();
    }
  }
  
  // 4. Genre Pills Filter (Matches mapped major categories)
  let matchesGenres = true;
  if (!excludeGenreFilter && genresVal.length > 0) {
    const showMajorGenres = getMajorGenres(show);
    matchesGenres = showMajorGenres.some(g => genresVal.includes(g));
  }
  
  return matchesSearch && matchesVenue && matchesDate && matchesGenres;
}

// Filter Logic
function applyFilters() {
  const searchQuery = activeFilters.search.toLowerCase().trim();
  const dateVal = activeFilters.date;
  const venueVal = activeFilters.venue;
  const genresVal = activeFilters.genres;
  
  // Toggle reset button
  if (clearFiltersBtn) {
    if (searchQuery !== '' || dateVal !== 'all' || venueVal !== 'all' || genresVal.length > 0) {
      clearFiltersBtn.style.display = 'inline-flex';
    } else {
      clearFiltersBtn.style.display = 'none';
    }
  }
  
  // Filter grouped concerts
  filteredConcerts = groupedConcerts.filter(show => checkShowMatch(show));
  
  // Dynamically update the genre pills counts based on matching shows
  populateGenrePills();
  
  renderConcerts();
}

// Reset all active filters
function clearFilters() {
  // Clear search input
  if (searchInput) {
    searchInput.value = '';
    activeFilters.search = '';
  }
  
  // Reset venue filter
  if (venueFilter) {
    venueFilter.value = 'all';
    activeFilters.venue = 'all';
  }
  
  // Reset date pills
  activeFilters.date = 'all';
  if (datePillsContainer) {
    datePillsContainer.querySelectorAll('.pill').forEach(btn => {
      if (btn.getAttribute('data-value') === 'all') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
  
  // Reset genre pills
  activeFilters.genres = [];
  if (genrePillsContainer) {
    genrePillsContainer.querySelectorAll('.pill').forEach(btn => {
      btn.classList.remove('active');
    });
  }
  
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
    
    // Smoothly scroll the Spotify player into view on smaller screens (mobile/tablet)
    // so the user does not have to scroll up manually to play or see the track loading.
    if (window.innerWidth <= 1100) {
      const sidebar = document.querySelector('.spotify-sidebar');
      if (sidebar) {
        sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    
    // Add a glowing pulse highlight to the Spotify widget to draw user's attention
    const widget = document.querySelector('.spotify-widget');
    if (widget) {
      widget.classList.add('widget-highlight');
      setTimeout(() => {
        widget.classList.remove('widget-highlight');
      }, 3000);
    }
    
    embedController.loadUri(`spotify:track:${trackId}`);
    
    // Trigger playback programmatically. We try immediately and after short delays,
    // which helps bypass load state latency if the browser allows autoplay.
    embedController.play();
    setTimeout(() => {
      if (embedController) {
        embedController.play();
      }
    }, 200);
    setTimeout(() => {
      if (embedController) {
        embedController.play();
      }
    }, 600);
    
    // Show the "Back to Playlist" button since we are playing a single track
    if (loadPlaylistBtn) {
      loadPlaylistBtn.style.display = 'inline-flex';
    }
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
  if (modalTitle) modalTitle.textContent = show.artist;
  if (modalVenueInfo) modalVenueInfo.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${show.venue}`;
  if (modalDateString) modalDateString.textContent = formattedDate;
  
  // Populate description
  if (modalDescriptionContainer && modalDescription) {
    if (show.description) {
      modalDescription.innerHTML = show.description;
      modalDescriptionContainer.style.display = 'block';
    } else {
      modalDescriptionContainer.style.display = 'none';
    }
  }
  
  if (modalHeaderBanner) {
    if (show.artistImageUrl) {
      modalHeaderBanner.style.backgroundImage = `url('${show.artistImageUrl}')`;
    } else {
      const modalGradient = getDeterministicGradient(show.artist);
      modalHeaderBanner.style.backgroundImage = modalGradient;
    }
  }
  
  // Sidebar info
  if (modalDetailDate) modalDetailDate.textContent = dateObj.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  if (modalDetailTime) modalDetailTime.textContent = formattedTime;
  if (modalDetailSources) {
    modalDetailSources.innerHTML = show.sources.map(source => {
      if (source === 'Songkick') {
        const url = show.ticketUrl || show.listingUrl || 'https://www.songkick.com';
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-green); text-decoration: underline; font-weight: 600;">Songkick</a>`;
      } else if (source === 'Santa Fe Reporter') {
        let url = 'https://calendar.sfreporter.com/calendars/all-events';
        if (show.sourceEventId) {
          url = `https://calendar.sfreporter.com/calendars/all-events/${show.sourceEventId}`;
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-green); text-decoration: underline; font-weight: 600;">Santa Fe Reporter</a>`;
      }
      return source;
    }).join(', ');
  }
  
  // Action Buttons
  if (modalTicketsBtn) {
    if (show.ticketUrl) {
      modalTicketsBtn.href = show.ticketUrl;
      modalTicketsBtn.style.display = 'inline-flex';
    } else {
      modalTicketsBtn.style.display = 'none';
    }
  }
  
  if (modalListingBtn) {
    if (show.listingUrl) {
      modalListingBtn.href = show.listingUrl;
      modalListingBtn.style.display = 'inline-flex';
    } else if (show.ticketUrl) {
      // Fallback to ticketUrl if no explicit listingUrl
      modalListingBtn.href = show.ticketUrl;
      modalListingBtn.style.display = 'inline-flex';
    } else {
      modalListingBtn.style.display = 'none';
    }
  }
  
  // Big Play Button in header
  if (modalHeaderPlayBtn) {
    if (show.trackIds && show.trackIds.length > 0) {
      modalHeaderPlayBtn.style.display = 'flex';
      modalHeaderPlayBtn.onclick = () => {
        playShowTracks(show.id);
      };
    } else {
      modalHeaderPlayBtn.style.display = 'none';
    }
  }
  
  // Get Directions link
  if (modalDirectionsBtn) {
    modalDirectionsBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(show.venue + ' Santa Fe NM')}`;
  }
  
  // Render performers lineup
  if (modalLineupList) {
    modalLineupList.innerHTML = '';
    
    show.performers.forEach(perf => {
      const card = document.createElement('div');
      card.className = 'performer-card';
      
      // Genres HTML (Displays raw Spotify genres for detail, very informative)
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
      let targetTrackId = '';
      if (perf.trackIds && perf.trackIds.length > 0) {
        targetTrackId = perf.trackIds[0];
      } else if (show.trackIds && show.trackIds.length > 0 && perf.name.toLowerCase() === show.artist.toLowerCase()) {
        // Main artist fallback to combined show tracks
        targetTrackId = show.trackIds[0];
      }
      
      if (targetTrackId) {
        listenButtonHtml = `
          <button class="performer-play-btn" aria-label="Listen artist track" data-track-id="${targetTrackId}">
            <i class="fa-solid fa-play"></i>
          </button>
        `;
      }
      
      const performerGradient = getDeterministicGradient(perf.name);
      card.innerHTML = `
        <div class="performer-avatar" ${perf.artistImageUrl ? `style="background-image: url('${perf.artistImageUrl}')"` : `style="background-image: ${performerGradient}"`}>
          ${!perf.artistImageUrl ? `<i class="fa-solid fa-user" style="color: rgba(255, 255, 255, 0.45); font-size: 1.2rem;"></i>` : ''}
        </div>
        <div class="performer-info">
          <h4 class="performer-name">${perf.name}</h4>
          ${genresHtml}
        </div>
        ${listenButtonHtml}
      `;
      
      modalLineupList.appendChild(card);
      
      // Attach click listener programmatically to preserve user gesture
      const listenBtn = card.querySelector('.performer-play-btn');
      if (listenBtn) {
        listenBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const trackId = listenBtn.getAttribute('data-track-id');
          if (trackId) {
            playTrackOnSpotify(trackId);
          }
        });
      }
    });
  }
  
  // Display modal overlay
  if (showModal) {
    showModal.style.display = 'flex';
  }
  document.body.style.overflow = 'hidden'; // Lock background scroll
  
  // Update URL hash without scroll jump
  if (window.location.hash !== `#${show.id}`) {
    history.replaceState(null, null, `#${show.id}`);
  }
}

// Close Modal helper
function closeModal() {
  if (showModal) {
    showModal.style.display = 'none';
  }
  document.body.style.overflow = ''; // Unlock background scroll
  
  // Clear URL hash without scroll jump
  if (window.location.hash) {
    history.replaceState(null, null, window.location.pathname + window.location.search);
  }
}

// Reset player back to weekly playlist
function loadWeeklyPlaylist() {
  if (embedController) {
    console.log('Loading Weekly Playlist...');
    isResettingPlayer = true;
    embedController.loadUri('spotify:playlist:7IhapNTY8GMvqflSaVyQfP');
    currentTrackId = null;
    clearHighlightState();
    if (loadPlaylistBtn) {
      loadPlaylistBtn.style.display = 'none';
    }
    
    // Clear flag after transition delay
    setTimeout(() => {
      isResettingPlayer = false;
    }, 1500);
  }
}

// Share event helper
function shareShow(show) {
  const shareUrl = `${window.location.origin}${window.location.pathname}#${show.id}`;
  const dateObj = new Date(show.date);
  const formattedDate = dateObj.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  
  const title = `${show.artist} @ ${show.venue}`;
  const text = `Check out ${show.artist} live at ${show.venue} in Santa Fe on ${formattedDate}!`;
  
  if (navigator.share) {
    navigator.share({
      title: title,
      text: text,
      url: shareUrl
    }).then(() => {
      console.log('Shared successfully');
    }).catch(err => {
      if (err.name !== 'AbortError') {
        console.error('Web Share failed:', err);
        fallbackCopyToClipboard(shareUrl);
      }
    });
  } else {
    fallbackCopyToClipboard(shareUrl);
  }
}

function fallbackCopyToClipboard(shareUrl) {
  navigator.clipboard.writeText(shareUrl).then(() => {
    if (modalShareBtn) {
      const originalHtml = modalShareBtn.innerHTML;
      modalShareBtn.innerHTML = `<i class="fa-solid fa-check" style="color: var(--primary-green);"></i> Link Copied!`;
      modalShareBtn.classList.add('btn-success-feedback');
      
      setTimeout(() => {
        modalShareBtn.innerHTML = originalHtml;
        modalShareBtn.classList.remove('btn-success-feedback');
      }, 2000);
    }
  }).catch(err => {
    console.error('Failed to copy share link: ', err);
    alert(`Copy this link to share the show: ${shareUrl}`);
  });
}

// Check Url hash to auto-open modal
function checkUrlHash() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#show-')) {
    const showId = hash.substring(1);
    const matchedShow = groupedConcerts.find(g => g.id === showId);
    if (matchedShow) {
      openShowDetailsModal(matchedShow);
    }
  }
}

// Spotify IFrame API Callback hook
window.onSpotifyIframeApiReady = (IFrameAPI) => {
  const element = document.getElementById('spotify-embed-iframe');
  if (!element) return;
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
      if (isResettingPlayer) {
        clearHighlightState();
        return;
      }
      
      const data = e.data;
      
      // Auto-hide load playlist button if user plays the weekly playlist inside the player
      if (data && data.contextURI && data.contextURI.includes('7IhapNTY8GMvqflSaVyQfP')) {
        if (loadPlaylistBtn) loadPlaylistBtn.style.display = 'none';
      }
      
      if (data && data.playingURI) {
        const trackUri = data.playingURI;
        const trackId = trackUri.split(':').pop();
        
        if (currentTrackId !== trackId) {
          currentTrackId = trackId;
          console.log(`Playback event, track ID: ${trackId}`);
          
          if (data.isPaused) {
            clearHighlightState();
          } else {
            // New track starting: scroll to and highlight card
            highlightActiveConcertByTrack(trackId, true);
          }
        } else {
          if (data.isPaused) {
            clearHighlightState();
          } else {
            // Same track: keep highlight active without stealing user scroll focus
            highlightActiveConcertByTrack(trackId, false);
          }
        }
      } else {
        clearHighlightState();
      }
    });
  };
  
  IFrameAPI.createController(element, options, callback);
};

// Find and highlight active concert card on the page based on playing track ID
function highlightActiveConcertByTrack(trackId, shouldScroll = false) {
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
    activeShowGroup = matchedShow;
    
    // 1. Update bottom playbar details
    if (playbarArtist) playbarArtist.textContent = matchedShow.artist;
    
    const dateFormatted = new Date(matchedShow.date).toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    if (playbarVenue) playbarVenue.textContent = `${matchedShow.venue} • ${dateFormatted}`;
    
    if (playbarImg) {
      if (matchedShow.artistImageUrl) {
        playbarImg.style.backgroundImage = `url('${matchedShow.artistImageUrl}')`;
      } else {
        playbarImg.style.backgroundImage = 'none';
      }
    }
    
    // 2. Playbar Actions
    if (playbarTicketsBtn) {
      if (matchedShow.ticketUrl) {
        playbarTicketsBtn.href = matchedShow.ticketUrl;
        playbarTicketsBtn.style.display = 'inline-flex';
      } else {
        playbarTicketsBtn.style.display = 'none';
      }
    }
    
    // Show playbar
    if (bottomPlaybar) bottomPlaybar.classList.add('active');
    
    // 3. Highlight grid card element
    const cardElement = Array.from(document.querySelectorAll('.concert-card')).find(el => {
      const showId = el.getAttribute('data-show-id');
      return showId === matchedShow.id;
    });
    
    if (cardElement) {
      cardElement.classList.add('currently-playing');
      
      // Scroll to it smoothly only when explicitly requested
      if (shouldScroll) {
        cardElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    }
  } else {
    // Active track does not belong to any upcoming show
    clearHighlightState();
  }
}

// Dismiss bottom playbar and card highlights
function clearHighlightState() {
  if (bottomPlaybar) bottomPlaybar.classList.remove('active');
  document.querySelectorAll('.concert-card.currently-playing').forEach(el => {
    el.classList.remove('currently-playing');
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // Input search
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      activeFilters.search = e.target.value;
      applyFilters();
    });
  }
  
  // Venue Select Dropdown
  if (venueFilter) {
    venueFilter.addEventListener('change', (e) => {
      activeFilters.venue = e.target.value;
      applyFilters();
    });
  }
  
  // Date pills toggle
  if (datePillsContainer) {
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
  }
  
  // Reset buttons
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);
  if (emptyResetBtn) emptyResetBtn.addEventListener('click', clearFilters);
  
  // Modal close trigger
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (showModal) {
    showModal.addEventListener('click', (e) => {
      if (e.target === showModal) {
        closeModal();
      }
    });
  }
  
  // Keyboard ESC to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });
  
  // Share button click handler
  if (modalShareBtn) {
    modalShareBtn.addEventListener('click', () => {
      if (activeShowGroup) {
        shareShow(activeShowGroup);
      }
    });
  }

  // Load playlist button click handler
  if (loadPlaylistBtn) {
    loadPlaylistBtn.addEventListener('click', loadWeeklyPlaylist);
  }
  
  // Playbar details click handler
  if (playbarDetailsBtn) {
    playbarDetailsBtn.addEventListener('click', () => {
      if (activeShowGroup) {
        openShowDetailsModal(activeShowGroup);
      }
    });
  }
  
  // Listen for hash changes to support back/forward navigation
  window.addEventListener('hashchange', checkUrlHash);
}

// Explicitly register inline event handlers on the window to prevent ReferenceErrors
window.playShowTracks = playShowTracks;
window.playTrackOnSpotify = playTrackOnSpotify;

// Bulletproof DOM initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
