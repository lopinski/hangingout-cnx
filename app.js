let mockEvents = [];
let currentFilter = 'filter_all';
let currentSubFilter = null;
let savedEvents = JSON.parse(localStorage.getItem('savedEvents') || '[]');
let currentTheme = localStorage.getItem('theme') || 'dark';

// Initialize theme
if (currentTheme === 'light') {
    document.body.setAttribute('data-theme', 'light');
}

window.toggleTheme = function() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', currentTheme);
    
    if (currentTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        document.getElementById('theme-toggle').innerText = '🌙';
    } else {
        document.body.removeAttribute('data-theme');
        document.getElementById('theme-toggle').innerText = '☀️';
    }
};

window.addEventListener('DOMContentLoaded', () => {
    if (currentTheme === 'light') {
        document.getElementById('theme-toggle').innerText = '🌙';
    }
});

window.toggleFavorite = function(eventId, eventElement) {
    if (eventElement) {
        eventElement.stopPropagation();
    }
    
    if (savedEvents.includes(eventId)) {
        savedEvents = savedEvents.filter(id => id !== eventId);
    } else {
        savedEvents.push(eventId);
    }
    
    localStorage.setItem('savedEvents', JSON.stringify(savedEvents));
    
    // Re-render to update the heart icons and feed if in saved view
    triggerRender();
};

const subCategoryMap = {
    'filter_music': ['Jazz', 'Blues', 'Reggae', 'Jam Session', 'Live Band'],
    'filter_dance': ['Salsa', 'Bachata', 'Ecstatic Dance', 'Party'],
    'filter_soul': ['Meditation', 'Retreats', 'Mindful Games', 'Spirituality'],
    'filter_workouts': ['Yoga', 'Muay Thai', 'Fitness'],
    'filter_courses': ['Cooking', 'Buddhism', 'Workshop'],
    'filter_markets': ['Night Market', 'Weekend Market', 'Shopping'],
    'filter_art': ['Art Exhibition', 'Temple Tours', 'Local Experience'],
    'filter_language': ['Exchange', 'Networking']
};

function fetchEvents() {
    mockEvents = window.eventsData || [];
    renderEvents();
}

function renderEvents() {
    const feed = document.getElementById('event-feed');
    feed.innerHTML = ''; // Clear existing

    let filteredEvents = mockEvents;
    
    if (currentFilter === 'filter_saved') {
        filteredEvents = mockEvents.filter(event => savedEvents.includes(event.id));
    } else if (currentFilter !== 'filter_all') {
        filteredEvents = mockEvents.filter(event => {
            const cat = (event.category || '').toLowerCase();
            const typ = (event.type || '').toLowerCase();
            
            let filterText = '';
            if (currentFilter === 'filter_workouts') filterText = 'workout';
            else if (currentFilter === 'filter_art') filterText = 'culture';
            else if (currentFilter === 'filter_music') filterText = 'music';
            else if (currentFilter === 'filter_soul') filterText = 'soul';
            else if (currentFilter === 'filter_language') filterText = 'language';
            else if (currentFilter === 'filter_dance') filterText = 'dance';
            else if (currentFilter === 'filter_markets') filterText = 'markets';
            else if (currentFilter === 'filter_courses') filterText = 'courses';
            
            return cat.includes(filterText) || typ.includes(filterText);
        });

    if (currentSubFilter) {
        filteredEvents = filteredEvents.filter(event => {
            if (!event.tags) return false;
            return event.tags.some(tag => tag.toLowerCase() === currentSubFilter.toLowerCase());
        });
    }

    if (filteredEvents.length === 0) {
        feed.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);" data-i18n="empty_events">${t('empty_events')}</div>`;
        return;
    }

    filteredEvents.forEach(event => {
        const isSaved = savedEvents.includes(event.id);
        const heartColor = isSaved ? 'var(--neon-green)' : 'rgba(255, 255, 255, 0.5)';
        const heartFill = isSaved ? 'var(--neon-green)' : 'none';
        
        const card = document.createElement('div');
        card.className = `event-card ${event.type}`;
        
        card.innerHTML = `
            <div onclick="this.closest('.event-card').classList.toggle('expanded')" style="cursor:pointer; display:block;">
                <div class="image-wrapper" style="position: relative;">
                    <img src="${event.imageUrl}" alt="${event.title}" class="event-image" onerror="this.style.display='none'; this.parentElement.style.height='180px'; this.parentElement.style.background='linear-gradient(45deg, #1a1a2e, #16213e)';">
                    <div class="date-badge">${event.date}</div>
                    <div class="event-time">${event.time}</div>
                    <button class="favorite-btn" onclick="toggleFavorite('${event.id}', event)" style="position: absolute; bottom: 15px; right: 15px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(5px); z-index: 10; transition: all 0.3s ease;">
                        <svg viewBox="0 0 24 24" width="22" height="22" stroke="${heartColor}" stroke-width="2" fill="${heartFill}" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </button>
                </div>
                <div class="event-details">
                    <div class="event-title">
                        <h3>${event.title}</h3>
                        <span class="free-tag">FREE</span>
                    </div>
                    <div class="event-venue">📍 ${event.venue}</div>
                    <div class="event-meta">
                        <span class="event-category">${event.category} | ${event.timeStatus}</span>
                    </div>
                    
                    <div class="event-expanded-content">
                        <p class="expanded-desc">${event.description || ''}</p>
                        <div class="expanded-actions">
                            <a href="https://maps.google.com/?q=${encodeURIComponent(event.venue + ' Chiang Mai')}" target="_blank" class="btn-maps" onclick="event.stopPropagation()">Google Maps</a>
                            ${event.link ? `<a href="${event.link}" target="_blank" class="btn-link" onclick="event.stopPropagation()" data-i18n="btn_learn_more">${t('btn_learn_more')}</a>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        feed.appendChild(card);
    });
}

// Set current date in header
function setDateHeader() {
    const dateHeader = document.getElementById('current-date');
    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    const dateString = new Date().toLocaleDateString('en-US', options).toUpperCase();
}

// Filter interaction
function initFilters() {
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const filterValue = chip.getAttribute('data-i18n');
            
            // Remove active class from all
            chips.forEach(c => c.classList.remove('active'));
            // Add to all matching chips (Home and Calendar views)
            document.querySelectorAll(`.filter-chip[data-i18n="${filterValue}"]`).forEach(c => c.classList.add('active'));
            
            currentFilter = filterValue;
            currentSubFilter = null; // Reset sub filter on main category change
            
            // Render sub-filters for BOTH Home and Calendar views
            const subContainers = document.querySelectorAll('.sub-filters-container');
            
            subContainers.forEach(subContainer => {
                const subContent = subContainer.querySelector('.scroll-x-container');
                // Set dynamic class for color matching
                subContainer.className = 'sub-filters-container ' + filterValue;
                
                if (subCategoryMap[filterValue]) {
                    subContainer.style.display = 'block';
                    subContent.innerHTML = '';
                    subCategoryMap[filterValue].forEach(sub => {
                        const subChip = document.createElement('button');
                        subChip.className = 'sub-filter-chip';
                        subChip.innerText = sub;
                        subChip.addEventListener('click', () => {
                            // Toggle active state globally across all sub-chips
                            document.querySelectorAll('.sub-filter-chip').forEach(c => c.classList.remove('active'));
                            if (currentSubFilter === sub) {
                                currentSubFilter = null; // Deselect
                            } else {
                                // Activate all sub-chips with this name
                                document.querySelectorAll('.sub-filter-chip').forEach(c => {
                                    if(c.innerText === sub) c.classList.add('active');
                                });
                                currentSubFilter = sub;
                            }
                            triggerRender();
                        });
                        subContent.appendChild(subChip);
                    });
                } else {
                    subContainer.style.display = 'none';
                    subContent.innerHTML = '';
                }
            });
            
            triggerRender();
        });
    });
}

function triggerRender() {
    const feed = document.getElementById('event-feed');
    if (feed) feed.style.opacity = '0.5';
    setTimeout(() => {
        renderEvents();
        renderCalendar();
        if (feed) feed.style.opacity = '1';
    }, 300);
}

// Bottom nav interaction
function initNav() {
    const navItems = document.querySelectorAll('.nav-item');
    const homeView = document.getElementById('home-view');
    const exploreView = document.getElementById('explore-view');
    const calendarView = document.getElementById('calendar-view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            const tabName = item.querySelector('span').innerText.trim();
            
            homeView.style.display = 'none';
            exploreView.style.display = 'none';
            calendarView.style.display = 'none';
            document.getElementById('about-view').style.display = 'none';
            document.getElementById('legal-view').style.display = 'none';

            if (tabName === 'Home') {
                homeView.style.display = 'block';
            } else if (tabName === 'Explore') {
                exploreView.style.display = 'block';
            } else if (tabName === 'Calendar') {
                calendarView.style.display = 'block';
                renderCalendar();
            }
        });
    });
}

// Explore Grid interaction
window.goToHomeFilter = function(filterKey) {
    // 1. Switch to Home view
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => n.classList.remove('active'));
    navItems[0].classList.add('active'); // First item is Home
    
    document.getElementById('explore-view').style.display = 'none';
    document.getElementById('calendar-view').style.display = 'none';
    document.getElementById('about-view').style.display = 'none';
    document.getElementById('legal-view').style.display = 'none';
    document.getElementById('home-view').style.display = 'block';

    // 2. Activate the corresponding chip
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(c => {
        c.classList.remove('active');
        if (c.getAttribute('data-i18n') === filterKey) {
            c.classList.add('active');
        }
    });

    // 3. Render events
    currentFilter = filterKey;
    renderEvents();
};

window.goToView = function(viewId) {
    document.getElementById('home-view').style.display = 'none';
    document.getElementById('explore-view').style.display = 'none';
    document.getElementById('calendar-view').style.display = 'none';
    document.getElementById('about-view').style.display = 'none';
    document.getElementById('legal-view').style.display = 'none';

    document.getElementById(viewId).style.display = 'block';
    window.scrollTo(0, 0);
};

window.showLegal = function(type) {
    goToView('legal-view');
    const title = document.getElementById('legal-title');
    const text = document.getElementById('legal-text');
    if (type === 'terms') {
        title.setAttribute('data-i18n', 'terms');
        title.innerText = t('terms');
        text.innerText = t('legal_terms');
    } else {
        title.setAttribute('data-i18n', 'privacy');
        title.innerText = t('privacy');
        text.innerText = t('legal_privacy');
    }
};

// renderCalendar logic follows

let currentCalendarDate = new Date(); // To track the currently viewed month
let selectedDate = null; // The exact day the user clicked

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const feed = document.getElementById('calendar-feed');
    feed.innerHTML = '';
    
    // Filter events globally
    let filteredEvents = mockEvents;
    if (currentFilter !== 'filter_all') {
        const typeMapping = {
            'filter_music': 'music',
            'filter_workouts': 'workout',
            'filter_language': 'language',
            'filter_art': 'culture',
            'filter_soul': 'soul',
            'filter_dance': 'dance',
            'filter_markets': 'markets',
            'filter_courses': 'courses'
        };
        const targetType = typeMapping[currentFilter];
        if (targetType) {
            filteredEvents = filteredEvents.filter(e => e.type === targetType);
        }
    }
    
    // Get year and month
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Adjust starting day (Monday = 1, Sunday = 7)
    let startDayOfWeek = firstDay.getDay();
    if (startDayOfWeek === 0) startDayOfWeek = 7; 
    
    const monthsNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Calendar Header
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.innerHTML = `
        <button class="calendar-nav-btn" onclick="changeMonth(-1)">&lt;</button>
        <h2>${monthsNames[month]} ${year}</h2>
        <button class="calendar-nav-btn" onclick="changeMonth(1)">&gt;</button>
    `;
    feed.appendChild(header);

    // Calendar Grid
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    weekdays.forEach(day => {
        grid.insertAdjacentHTML('beforeend', `<div class="weekday">${day}</div>`);
    });

    // Empty slots before first day
    for (let i = 1; i < startDayOfWeek; i++) {
        grid.insertAdjacentHTML('beforeend', `<div class="calendar-day empty"></div>`);
    }

    // Days
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Default select today if nothing selected
    if (!selectedDate) {
        selectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
        const d = new Date(year, month, i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        // Find events for this day using filteredEvents
        const dayEvents = filteredEvents.filter(e => e.date === dateStr);
        let dotsHtml = '';
        if (dayEvents.length > 0) {
            // Get unique types
            const types = [...new Set(dayEvents.map(e => e.type))];
            dotsHtml = `<div class="event-dots">${types.map(t => `<span class="dot dot-${t}"></span>`).join('')}</div>`;
        }

        const isToday = d.getTime() === today.getTime() ? 'today' : '';
        const isActive = dateStr === selectedDate ? 'active-day' : '';

        const dayCell = document.createElement('div');
        dayCell.className = `calendar-day ${isToday} ${isActive}`;
        dayCell.innerHTML = `
            <div class="day-number">${i}</div>
            ${dotsHtml}
        `;
        
        dayCell.onclick = () => {
            selectedDate = dateStr;
            renderCalendar();
        };

        grid.appendChild(dayCell);
    }
    feed.appendChild(grid);

    // Active Events Feed
    const activeEvents = filteredEvents.filter(e => e.date === selectedDate);
    
    const feedTitle = document.createElement('h3');
    feedTitle.style.marginBottom = '15px';
    feedTitle.style.color = 'var(--text-light)';
    
    const selectedDateObj = new Date(selectedDate);
    feedTitle.innerText = `Events for ${selectedDateObj.getDate()} ${monthsNames[selectedDateObj.getMonth()]}`;
    feed.appendChild(feedTitle);

    if (activeEvents.length === 0) {
        feed.insertAdjacentHTML('beforeend', `<div style="text-align:center; padding:40px; color:var(--text-muted);">${t('empty_events')}</div>`);
        return;
    }

    activeEvents.forEach(event => {
        const card = document.createElement('div');
        card.className = `event-card ${event.type}`;
        
        card.innerHTML = `
            <div onclick="this.closest('.event-card').classList.toggle('expanded')" style="cursor:pointer; display:block;">
                <div class="image-wrapper" style="position: relative;">
                    <img src="${event.imageUrl}" alt="${event.title}" class="event-image" onerror="this.style.display='none'; this.parentElement.style.height='180px'; this.parentElement.style.background='linear-gradient(45deg, #1a1a2e, #16213e)';">
                    <div class="date-badge">${event.date}</div>
                    <div class="event-time">${event.time}</div>
                </div>
                <div class="event-details">
                    <div class="event-title">
                        <h3>${event.title}</h3>
                        <span class="free-tag">FREE</span>
                    </div>
                    <div class="event-venue">📍 ${event.venue}</div>
                    
                    <div class="event-expanded-content">
                        <p class="expanded-desc">${event.description || ''}</p>
                        <div class="expanded-actions">
                            <a href="https://maps.google.com/?q=${encodeURIComponent(event.venue + ' Chiang Mai')}" target="_blank" class="btn-maps" onclick="event.stopPropagation()">Google Maps</a>
                            ${event.link ? `<a href="${event.link}" target="_blank" class="btn-link" onclick="event.stopPropagation()" data-i18n="btn_learn_more">${t('btn_learn_more')}</a>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        feed.appendChild(card);
    });
}

// Cookie Banner & Back To Top Logic
window.acceptCookies = function() {
    localStorage.setItem('cookieConsent', 'true');
    document.getElementById('cookie-banner').style.display = 'none';
};

function initUX() {
    if (!localStorage.getItem('cookieConsent')) {
        document.getElementById('cookie-banner').style.display = 'flex';
    }

    const btt = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            btt.style.display = 'flex';
        } else {
            btt.style.display = 'none';
        }
    });
    
    btt.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setDateHeader();
    fetchEvents();
    initFilters();
    initNav();
    initUX();
});
