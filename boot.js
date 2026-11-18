// Applies a stored theme before first paint. Preferences live only in localStorage.
(function () {
    try {
        var theme = localStorage.getItem('theme');
        if (theme === 'light' || theme === 'dark') {
            document.documentElement.setAttribute('data-theme', theme);
        }
    } catch (e) { /* storage unavailable: follow the OS setting via CSS */ }
})();
