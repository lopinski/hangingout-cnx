let mockEvents = [];
let currentFilter = 'filter_all';

function fetchEvents() {
    mockEvents = window.eventsData || [];
    renderEvents();
}

function renderEvents() {
    const feed = document.getElementById('event-feed');
    feed.innerHTML = ''; // Clear existing

    const filteredEvents = currentFilter === 'filter_all' 
        ? mockEvents 
        : mockEvents.filter(event => {
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

    if (filteredEvents.length === 0) {
        feed.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);" data-i18n="empty_events">${t('empty_events')}</div>`;
        return;
    }

    filteredEvents.forEach(event => {
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
            // Remove active class from all
            chips.forEach(c => c.classList.remove('active'));
            // Add to clicked
            chip.classList.add('active');
            
            // Actualizar filtro y re-renderizar
            currentFilter = chip.getAttribute('data-i18n');
            
            const feed = document.getElementById('event-feed');
            feed.style.opacity = '0.5';
            setTimeout(() => {
                renderEvents();
                feed.style.opacity = '1';
            }, 300);
        });
    });
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

let currentCalendarTab = null;
let currentCalendarMode = 'day'; // 'day', 'week', 'month'

function renderCalendar() {
    const feed = document.getElementById('calendar-feed');
    feed.innerHTML = '';
    
    // Mode Switcher UI
    const modeContainer = document.createElement('div');
    modeContainer.className = 'calendar-mode-switcher';
    modeContainer.innerHTML = `
        <button class="mode-btn ${currentCalendarMode === 'day' ? 'active' : ''}" data-mode="day" data-i18n="cal_day">${t('cal_day')}</button>
        <button class="mode-btn ${currentCalendarMode === 'week' ? 'active' : ''}" data-mode="week" data-i18n="cal_week">${t('cal_week')}</button>
        <button class="mode-btn ${currentCalendarMode === 'month' ? 'active' : ''}" data-mode="month" data-i18n="cal_month">${t('cal_month')}</button>
    `;
    feed.appendChild(modeContainer);

    modeContainer.querySelectorAll('.mode-btn').forEach(btn => {
        btn.onclick = () => {
            currentCalendarMode = btn.getAttribute('data-mode');
            renderCalendar();
        };
    });
    
    const today = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let activeEvents = [];

    if (currentCalendarMode === 'day') {
        const daysList = [];
        for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const dateStr = `${d.getDate()} ${months[d.getMonth()]}`;
            daysList.push(dateStr);
        }
        
        if (!currentCalendarTab) {
            currentCalendarTab = daysList[0];
        }

        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'scroll-x-container';
        tabsContainer.style.display = 'flex';
        tabsContainer.style.gap = '10px';
        tabsContainer.style.marginBottom = '20px';
        tabsContainer.style.overflowX = 'auto';
        tabsContainer.style.paddingBottom = '10px';
        
        daysList.forEach(dateLabel => {
            const btn = document.createElement('button');
            btn.innerText = dateLabel;
            btn.className = 'filter-chip';
            if (currentCalendarTab === dateLabel) btn.classList.add('active');
            
            btn.onclick = () => {
                currentCalendarTab = dateLabel;
                renderCalendar();
            };
            tabsContainer.appendChild(btn);
        });
        feed.appendChild(tabsContainer);

        activeEvents = mockEvents.filter(e => e.date === currentCalendarTab);
    } else {
        const daysAhead = currentCalendarMode === 'week' ? 7 : 30;
        const validDatesArr = [];
        for (let i = 0; i < daysAhead; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            validDatesArr.push(`${d.getDate()} ${months[d.getMonth()]}`);
        }
        activeEvents = mockEvents.filter(e => validDatesArr.includes(e.date));
        // Sort chronologically
        activeEvents.sort((a, b) => validDatesArr.indexOf(a.date) - validDatesArr.indexOf(b.date));
    }
    
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
