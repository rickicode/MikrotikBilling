# Troubleshooting Guide

## Table of Contents
1. [Common Issues](#common-issues)
2. [Performance Problems](#performance-problems)
3. [Accessibility Issues](#accessibility-issues)
4. [Mobile/Responsive Issues](#mobileresponsive-issues)
5. [CSS/Animation Issues](#cssanimation-issues)
6. [JavaScript Errors](#javascript-errors)
7. [Browser Compatibility](#browser-compatibility)
8. [Build/Deployment Issues](#builddeployment-issues)
9. [Debugging Tools](#debugging-tools)
10. [Solutions](#solutions)

---

## Common Issues

### Dark Theme Not Working
**Problem**: Dark theme is not applying or switching properly

**Debugging Steps**:
```javascript
// Check if dark class is applied
console.log('Dark class on html:', document.documentElement.classList.contains('dark'));

// Check CSS custom properties
const computedStyle = getComputedStyle(document.documentElement);
console.log('Primary color:', computedStyle.getPropertyValue('--primary-500'));

// Check system preference
console.log('System prefers dark:', window.matchMedia('(prefers-color-scheme: dark)').matches);

// Check localStorage
console.log('Stored theme:', localStorage.getItem('theme'));
```

**Solution**:
```javascript
// Ensure theme initialization
function initTheme() {
    const storedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const theme = storedTheme || (systemPrefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
}

// Initialize on page load
initTheme();

// Listen for system preference changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', initTheme);
```

### Tailwind CSS Not Loading
**Problem**: Tailwind styles are not being applied

**Debugging Steps**:
```javascript
// Check if CSS file is loaded
const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
linkElements.forEach(link => {
    console.log('CSS loaded:', link.href, link.sheet ? '✅' : '❌');
});

// Check for Tailwind utility classes
const testElement = document.createElement('div');
testElement.className = 'bg-blue-500';
document.body.appendChild(testElement);
const computedBg = getComputedStyle(testElement).backgroundColor;
document.body.removeChild(testElement);
console.log('Tailwind working:', computedBg.includes('59, 130, 246'));
```

**Solution**:
```html
<!-- Ensure proper CSS loading in header -->
<head>
    <!-- Critical CSS inline -->
    <style>
        /* Critical styles */
    </style>

    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>

    <!-- Custom CSS -->
    <link rel="preload" href="/css/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
    <noscript><link rel="stylesheet" href="/css/style.css"></noscript>
</head>
```

### JavaScript Not Working
**Problem**: JavaScript functionality is broken or not loading

**Debugging Steps**:
```javascript
// Check for JavaScript errors
console.clear();
window.addEventListener('error', (e) => {
    console.error('JavaScript Error:', e.error);
});

// Check if modules are loaded
console.log('jQuery loaded:', typeof $ !== 'undefined');
console.log('Modern features supported:',
    'IntersectionObserver' in window,
    'MutationObserver' in window,
    'fetch' in window
);
```

**Solution**:
```javascript
// Wrap code in DOM ready event
document.addEventListener('DOMContentLoaded', function() {
    // Your initialization code here
    console.log('DOM ready, initializing...');

    // Initialize components
    if (typeof $ !== 'undefined') {
        // jQuery-based code
    }

    // Modern JavaScript code
    initComponents();
});

// Fallback for older browsers
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
```

---

## Performance Problems

### Slow Page Load
**Problem**: Pages are loading slowly

**Debugging Steps**:
```javascript
// Measure load performance
window.addEventListener('load', () => {
    const perfData = performance.getEntriesByType('navigation')[0];
    console.log('Load Performance:', {
        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.navigationStart,
        loadComplete: perfData.loadEventEnd - perfData.navigationStart,
        domInteractive: perfData.domInteractive - perfData.navigationStart
    });
});

// Check resource loading
performance.getEntriesByType('resource').forEach(resource => {
    if (resource.duration > 1000) {
        console.warn('Slow resource:', resource.name, resource.duration + 'ms');
    }
});
```

**Solutions**:
```html
<!-- Optimize CSS loading -->
<head>
    <!-- Inline critical CSS -->
    <style>
        /* Critical above-the-fold styles */
    </style>

    <!-- Preload important resources -->
    <link rel="preload" href="/css/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
    <link rel="preload" href="/js/main.js" as="script">

    <!-- Defer non-critical JavaScript -->
    <script src="/js/main.js" defer></script>
</head>

<!-- Lazy load images -->
<img src="/placeholder.jpg" data-src="/actual-image.jpg" loading="lazy" class="lazy-image">

<!-- Optimize font loading -->
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
```

### Poor Animation Performance
**Problem**: Animations are laggy or causing jank

**Debugging Steps**:
```javascript
// Monitor frame rate during animations
let frameCount = 0;
let lastTime = performance.now();

function measureFPS() {
    frameCount++;
    const currentTime = performance.now();

    if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        if (fps < 55) {
            console.warn(`Low FPS during animation: ${fps}`);
        }
        frameCount = 0;
        lastTime = currentTime;
    }

    requestAnimationFrame(measureFPS);
}

measureFPS();
```

**Solutions**:
```css
/* Use GPU-accelerated properties */
.smooth-animation {
    transform: translateZ(0); /* Force GPU layer */
    will-change: transform, opacity; /* Hint browser */
    transition: transform 0.3s ease, opacity 0.3s ease;
}

/* Avoid animating layout properties */
.poor-performance {
    /* Don't animate: width, height, padding, margin */
    /* Don't animate: left, top, right, bottom */
}

/* Optimize animations for reduced motion */
@media (prefers-reduced-motion: reduce) {
    .animated-element {
        animation: none !important;
        transition: none !important;
    }
}
```

### Memory Leaks
**Problem**: Memory usage is increasing over time

**Debugging Steps**:
```javascript
// Monitor memory usage
function checkMemory() {
    if (performance.memory) {
        console.log('Memory Usage:', {
            used: Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB',
            total: Math.round(performance.memory.totalJSHeapSize / 1048576) + 'MB',
            limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576) + 'MB'
        });
    }
}

// Check for memory leaks
setInterval(checkMemory, 30000);

// Monitor event listeners
function trackEventListeners() {
    const elements = document.querySelectorAll('*');
    let listenerCount = 0;

    elements.forEach(element => {
        const listeners = getEventListeners ? getEventListeners(element) : {};
        listenerCount += Object.values(listeners).reduce((sum, arr) => sum + arr.length, 0);
    });

    console.log('Total event listeners:', listenerCount);
}
```

**Solutions**:
```javascript
// Clean up event listeners
class ComponentManager {
    constructor() {
        this.eventListeners = [];
    }

    addEventListener(element, event, handler) {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
    }

    cleanup() {
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
    }
}

// Use IntersectionObserver instead of scroll events
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            // Load content or start animation
        }
    });
});
```

---

## Accessibility Issues

### Poor Color Contrast
**Problem**: Text doesn't have sufficient contrast

**Debugging Steps**:
```javascript
// Check contrast ratios
function checkContrast(element) {
    const styles = getComputedStyle(element);
    const color = styles.color;
    const backgroundColor = styles.backgroundColor;

    console.log('Element contrast check:', {
        color,
        backgroundColor,
        element: element.tagName + (element.className ? '.' + element.className : '')
    });
}

// Check all text elements
document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button').forEach(checkContrast);
```

**Solutions**:
```css
/* Ensure proper contrast ratios */
.text-primary {
    color: #1f2937; /* 15.8:1 against white */
}

.text-secondary {
    color: #6b7280; /* 7.2:1 against white */
}

/* Dark theme adjustments */
.dark .text-primary {
    color: #f9fafb; /* 15.8:1 against dark */
}

.dark .text-secondary {
    color: #d1d5db; /* 12.6:1 against dark */
}

/* High contrast mode support */
@media (prefers-contrast: high) {
    .btn {
        border: 2px solid currentColor;
    }
}
```

### Keyboard Navigation Issues
**Problem**: Can't navigate with keyboard

**Debugging Steps**:
```javascript
// Test keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        console.log('Tab pressed, focused element:', document.activeElement);

        // Check if focus is visible
        const styles = getComputedStyle(document.activeElement);
        const hasFocusStyle = styles.outline !== 'none' || styles.boxShadow !== 'none';

        if (!hasFocusStyle) {
            console.warn('Focus indicator not visible on:', document.activeElement);
        }
    }
});
```

**Solutions**:
```css
/* Ensure focus indicators are visible */
.focus-visible {
    outline: 2px solid var(--primary-500);
    outline-offset: 2px;
}

/* Skip focus styles for mouse interactions */
button:focus:not(:focus-visible) {
    outline: none;
}

button:focus-visible {
    outline: 2px solid var(--primary-500);
    outline-offset: 2px;
}

/* High contrast focus */
@media (prefers-contrast: high) {
    .focus-visible {
        outline: 3px solid;
        outline-color: Highlight;
    }
}
```

### Screen Reader Issues
**Problem**: Content not accessible to screen readers

**Debugging Steps**:
```javascript
// Check for proper semantic structure
function checkSemanticStructure() {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const landmarks = document.querySelectorAll('header, nav, main, aside, footer');
    const images = document.querySelectorAll('img');

    console.log('Semantic Structure:', {
        headings: headings.length,
        landmarks: landmarks.length,
        imagesWithoutAlt: Array.from(images).filter(img => !img.alt).length
    });
}

checkSemanticStructure();
```

**Solutions**:
```html
<!-- Add proper semantic structure -->
<header role="banner">
    <nav role="navigation" aria-label="Main navigation">
        <!-- Navigation content -->
    </nav>
</header>

<main role="main" id="main-content">
    <h1>Page Title</h1>
    <!-- Main content -->
</main>

<aside role="complementary">
    <!-- Sidebar content -->
</aside>

<footer role="contentinfo">
    <!-- Footer content -->
</footer>

<!-- Add skip links -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<!-- Ensure images have alt text -->
<img src="/chart.png" alt="Sales chart showing 25% increase">
<img src="/decoration.png" alt="" role="presentation">
```

---

## Mobile/Responsive Issues

### Layout Breaking on Mobile
**Problem**: Design breaks on mobile devices

**Debugging Steps**:
```javascript
// Test different viewport sizes
function testViewport(width, height) {
    console.log(`Testing viewport: ${width}x${height}`);

    // Use browser dev tools or emulate viewport
    // Check for overflow issues
    const documentWidth = document.documentElement.scrollWidth;
    const viewportWidth = window.innerWidth;

    if (documentWidth > viewportWidth) {
        console.warn('Horizontal overflow detected');
    }
}

// Check responsive breakpoints
const breakpoints = [320, 375, 414, 768, 1024, 1280];
breakpoints.forEach(width => {
    console.log(`Breakpoint ${width}px layout check`);
});
```

**Solutions**:
```css
/* Mobile-first responsive design */
.container {
    width: 100%;
    padding: 1rem;
}

@media (min-width: 640px) {
    .container {
        max-width: 640px;
        margin: 0 auto;
        padding: 1.5rem;
    }
}

@media (min-width: 1024px) {
    .container {
        max-width: 1024px;
        padding: 2rem;
    }
}

/* Prevent horizontal overflow */
body {
    overflow-x: hidden;
}

/* Responsive images */
img {
    max-width: 100%;
    height: auto;
}

/* Responsive tables */
.table-responsive {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}
```

### Touch Issues
**Problem**: Touch interactions not working properly

**Debugging Steps**:
```javascript
// Test touch events
document.addEventListener('touchstart', (e) => {
    console.log('Touch start:', e.target);
});

document.addEventListener('touchend', (e) => {
    console.log('Touch end:', e.target);
});

// Check touch target sizes
document.querySelectorAll('button, a, input, select, textarea').forEach(element => {
    const rect = element.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (width < 44 || height < 44) {
        console.warn('Touch target too small:', element, `${width}x${height}px`);
    }
});
```

**Solutions**:
```css
/* Ensure minimum touch target sizes */
.btn {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1rem;
}

/* Add spacing for touch targets */
.touch-group {
    display: flex;
    gap: 0.5rem;
}

/* Touch-friendly form elements */
.form-input {
    min-height: 44px;
    font-size: 16px; /* Prevent zoom on iOS */
}

/* Remove tap delay on touch devices */
.btn, a {
    touch-action: manipulation;
}
```

---

## CSS/Animation Issues

### CSS Not Applying
**Problem**: CSS styles are not being applied

**Debugging Steps**:
```javascript
// Check CSS loading
function checkCSSLoading() {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(link => {
        console.log(`CSS: ${link.href}`, link.sheet ? '✅' : '❌');
    });

    // Check computed styles
    const testElement = document.querySelector('.test-element');
    if (testElement) {
        const styles = getComputedStyle(testElement);
        console.log('Computed styles:', {
            display: styles.display,
            color: styles.color,
            backgroundColor: styles.backgroundColor
        });
    }
}

checkCSSLoading();
```

**Solutions**:
```html
<!-- Ensure proper CSS loading order -->
<head>
    <!-- 1. Reset/normalize -->
    <link rel="stylesheet" href="/css/normalize.css">

    <!-- 2. Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>

    <!-- 3. Custom CSS -->
    <link rel="stylesheet" href="/css/style.css">

    <!-- 4. Component-specific CSS -->
    <link rel="stylesheet" href="/css/components.css">
</head>

<!-- Check for CSS conflicts -->
<style>
    /* Ensure styles have higher specificity */
.component-name.component-name {
    /* Styles here */
}
</style>
```

### Animations Not Working
**Problem**: CSS animations are not playing

**Debugging Steps**:
```javascript
// Check animation support
const animationSupport = 'animation' in document.documentElement.style;
console.log('Animation support:', animationSupport);

// Check if animation is applied
const animatedElement = document.querySelector('.animated-element');
if (animatedElement) {
    const styles = getComputedStyle(animatedElement);
    console.log('Animation applied:', {
        animationName: styles.animationName,
        animationDuration: styles.animationDuration,
        animationPlayState: styles.animationPlayState
    });
}
```

**Solutions**:
```css
/* Ensure animation properties are set correctly */
.animated-element {
    animation-name: slideIn;
    animation-duration: 0.3s;
    animation-timing-function: ease-out;
    animation-fill-mode: forwards;
}

/* Trigger animation with class */
.animated-element.active {
    animation-play-state: running;
}

/* Fallback for browsers without animation support */
@supports not (animation: slideIn 0.3s ease-out) {
    .animated-element {
        transform: translateX(0);
        opacity: 1;
    }
}
```

---

## JavaScript Errors

### Console Errors
**Problem**: JavaScript errors in console

**Debugging Steps**:
```javascript
// Global error handler
window.addEventListener('error', (e) => {
    console.error('JavaScript Error:', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: e.error
    });
});

// Promise rejection handler
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled Promise Rejection:', e.reason);
});

// Check for undefined variables
console.log('Variables check:', {
    jQuery: typeof $ !== 'undefined',
    fetch: typeof fetch !== 'undefined',
    IntersectionObserver: typeof IntersectionObserver !== 'undefined'
});
```

**Solutions**:
```javascript
// Safe variable access
window.safeAccess = function(obj, path, defaultValue = null) {
    try {
        return path.split('.').reduce((current, key) => current[key], obj);
    } catch (e) {
        return defaultValue;
    }
};

// Safe event handling
function safeAddEventListener(element, event, handler) {
    if (element && typeof element.addEventListener === 'function') {
        element.addEventListener(event, handler);
    }
}

// Fallback for missing features
if (typeof fetch === 'undefined') {
    window.fetch = /* polyfill implementation */;
}
```

### Event Handler Issues
**Problem**: Event handlers not working

**Debugging Steps**:
```javascript
// Test event binding
function testEventBinding() {
    const testButton = document.createElement('button');
    testButton.textContent = 'Test';
    document.body.appendChild(testButton);

    testButton.addEventListener('click', () => {
        console.log('Test button clicked');
    });

    // Simulate click
    testButton.click();

    // Cleanup
    document.body.removeChild(testButton);
}

testEventBinding();
```

**Solutions**:
```javascript
// Use event delegation for dynamic content
document.addEventListener('click', (e) => {
    const button = e.target.closest('.btn');
    if (button) {
        handleButtonClick(button, e);
    }
});

// Ensure elements exist before binding
function bindEvents() {
    const element = document.querySelector('#my-element');
    if (element) {
        element.addEventListener('click', handler);
    } else {
        console.warn('Element not found for event binding');
    }
}

// Use DOM ready event
document.addEventListener('DOMContentLoaded', bindEvents);
```

---

## Browser Compatibility

### Issues in Specific Browsers
**Problem**: Features not working in certain browsers

**Debugging Steps**:
```javascript
// Check browser capabilities
function checkBrowserSupport() {
    const features = {
        cssGrid: CSS.supports('display', 'grid'),
        cssVariables: CSS.supports('color', 'var(--test)'),
        intersectionObserver: 'IntersectionObserver' in window,
        mutationObserver: 'MutationObserver' in window,
        fetch: 'fetch' in window,
        promises: 'Promise' in window
    };

    console.log('Browser Support:', features);
    return features;
}

checkBrowserSupport();
```

**Solutions**:
```css
/* Feature detection with @supports */
@supports (display: grid) {
    .grid-layout {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }
}

@supports not (display: grid) {
    .grid-layout {
        display: flex;
        flex-wrap: wrap;
    }

    .grid-layout > * {
        flex: 1 1 300px;
    }
}

/* Fallback for older browsers */
.no-cssgrid .grid-layout {
    display: flex;
    flex-wrap: wrap;
}
```

### Polyfills
```javascript
// Load polyfills for missing features
function loadPolyfills(features) {
    const polyfills = [];

    if (!features.fetch) {
        polyfills.push(loadScript('/js/polyfills/fetch.js'));
    }

    if (!features.intersectionObserver) {
        polyfills.push(loadScript('/js/polyfills/intersection-observer.js'));
    }

    if (!features.promises) {
        polyfills.push(loadScript('/js/polyfills/promise.js'));
    }

    return Promise.all(polyfills);
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Initialize with polyfills
const features = checkBrowserSupport();
loadPolyfills(features).then(() => {
    console.log('Polyfills loaded, initializing app');
    initApp();
});
```

---

## Build/Deployment Issues

### Assets Not Loading
**Problem**: CSS/JS files not loading in production

**Debugging Steps**:
```javascript
// Check asset loading
function checkAssetLoading() {
    const assets = [
        '/css/style.css',
        '/js/main.js',
        '/images/logo.png'
    ];

    assets.forEach(asset => {
        fetch(asset, { method: 'HEAD' })
            .then(response => {
                console.log(`Asset ${asset}:`, response.ok ? '✅' : '❌');
            })
            .catch(error => {
                console.error(`Asset ${asset}:`, error);
            });
    });
}

checkAssetLoading();
```

**Solutions**:
```html
<!-- Use absolute paths -->
<link rel="stylesheet" href="/css/style.css">
<script src="/js/main.js"></script>

<!-- Add cache busting for development -->
<link rel="stylesheet" href="/css/style.css?v=<?php echo time(); ?>">
<script src="/js/main.js?v=<?php echo time(); ?>"></script>

<!-- Fallback for CDN resources -->
<script src="https://cdn.tailwindcss.com"></script>
<script>
    if (typeof tailwind === 'undefined') {
        document.write('<script src="/js/tailwind-fallback.js"><\/script>');
    }
</script>
```

---

## Debugging Tools

### Browser DevTools Setup
```javascript
// Performance monitoring
const performanceObserver = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
        if (entry.entryType === 'measure') {
            console.log(`Performance: ${entry.name} - ${entry.duration}ms`);
        }
    });
});

performanceObserver.observe({ entryTypes: ['measure'] });

// Debug panel
function createDebugPanel() {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.innerHTML = `
        <div style="position: fixed; top: 10px; right: 10px; background: #000; color: #fff; padding: 10px; border-radius: 5px; z-index: 9999; font-family: monospace; font-size: 12px;">
            <div>Viewport: <span id="viewport-size"></span></div>
            <div>Scroll: <span id="scroll-position"></span></div>
            <div>Focus: <span id="focused-element"></span></div>
            <div>Theme: <span id="current-theme"></span></div>
            <button onclick="toggleDebugInfo()" style="margin-top: 10px; padding: 5px;">Toggle Info</button>
        </div>
    `;
    document.body.appendChild(panel);

    updateDebugInfo();
}

function updateDebugInfo() {
    document.getElementById('viewport-size').textContent = `${window.innerWidth}x${window.innerHeight}`;
    document.getElementById('scroll-position').textContent = `${window.scrollX}, ${window.scrollY}`;
    document.getElementById('focused-element').textContent = document.activeElement.tagName;
    document.getElementById('current-theme').textContent = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

// Initialize debug panel in development
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    createDebugPanel();
    window.addEventListener('scroll', updateDebugInfo);
    window.addEventListener('resize', updateDebugInfo);
    document.addEventListener('focusin', updateDebugInfo);
}
```

### Console Commands
```javascript
// Quick debugging commands
window.debug = {
    // Check element styles
    styles: (selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element) : null;
    },

    // Test animation
    animate: (selector, animation) => {
        const element = document.querySelector(selector);
        if (element) {
            element.style.animation = animation;
        }
    },

    // Check responsive breakpoints
    breakpoint: () => {
        const width = window.innerWidth;
        let breakpoint = 'xs';
        if (width >= 640) breakpoint = 'sm';
        if (width >= 768) breakpoint = 'md';
        if (width >= 1024) breakpoint = 'lg';
        if (width >= 1280) breakpoint = 'xl';
        return `${breakpoint} (${width}px)`;
    },

    // Test theme toggle
    toggleTheme: () => {
        document.documentElement.classList.toggle('dark');
        const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
        console.log(`Theme changed to: ${theme}`);
    },

    // Check accessibility
    a11y: () => {
        const images = document.querySelectorAll('img:not([alt])');
        const buttons = document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])');
        const links = document.querySelectorAll('a[href="#"]');

        console.log('Accessibility Issues:', {
            imagesWithoutAlt: images.length,
            buttonsWithoutLabels: buttons.length,
            emptyLinks: links.length
        });

        return { images, buttons, links };
    }
};
```

### Error Logging
```javascript
// Enhanced error logging
class ErrorLogger {
    constructor() {
        this.errors = [];
        this.init();
    }

    init() {
        window.addEventListener('error', (e) => {
            this.logError({
                type: 'javascript',
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                stack: e.error?.stack,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                userAgent: navigator.userAgent
            });
        });

        window.addEventListener('unhandledrejection', (e) => {
            this.logError({
                type: 'promise',
                message: e.reason?.message || e.reason,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                userAgent: navigator.userAgent
            });
        });
    }

    logError(error) {
        this.errors.push(error);
        console.error('Logged Error:', error);

        // Send to error tracking service in production
        if (location.hostname !== 'localhost') {
            this.sendError(error);
        }
    }

    sendError(error) {
        // Implement error tracking service integration
        // Example: Sentry, LogRocket, etc.
    }

    getErrors() {
        return this.errors;
    }
}

// Initialize error logger
const errorLogger = new ErrorLogger();
window.errorLogger = errorLogger;
```

---

## Solutions

### Quick Fixes

#### Reset CSS Cache
```html
<!-- Force cache refresh -->
<link rel="stylesheet" href="/css/style.css?v=<?php echo filemtime('/css/style.css'); ?>">
```

#### Fix Dark Theme
```javascript
// Immediate theme fix
function fixTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
}
fixTheme();
```

#### Fix Mobile Menu
```javascript
// Ensure mobile menu works
function fixMobileMenu() {
    const menuButton = document.querySelector('.mobile-menu-btn');
    const mobileMenu = document.querySelector('.mobile-menu');

    if (menuButton && mobileMenu) {
        menuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
            menuButton.setAttribute('aria-expanded',
                mobileMenu.classList.contains('active')
            );
        });
    }
}
fixMobileMenu();
```

### Health Check Script
```javascript
// Comprehensive health check
function runHealthCheck() {
    console.group('🔍 System Health Check');

    // 1. Theme System
    const themeWorking = document.documentElement.classList.contains('dark') ||
                       !document.documentElement.classList.contains('dark');
    console.log('Theme System:', themeWorking ? '✅' : '❌');

    // 2. Responsive Design
    const viewportWidth = window.innerWidth;
    console.log('Viewport Width:', viewportWidth + 'px');

    // 3. JavaScript Features
    const features = {
        fetch: 'fetch' in window,
        intersectionObserver: 'IntersectionObserver' in window,
        localStorage: 'localStorage' in window
    };
    console.log('JavaScript Features:', features);

    // 4. CSS Loading
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
    const loadedStyles = Array.from(stylesheets).filter(link => link.sheet);
    console.log('CSS Loading:', `${loadedStyles.length}/${stylesheets.length} loaded`);

    // 5. Images
    const images = document.querySelectorAll('img');
    const loadedImages = Array.from(images).filter(img => img.complete);
    console.log('Images:', `${loadedImages.length}/${images.length} loaded`);

    // 6. Console Errors
    const hasErrors = window.errorLogger?.getErrors().length > 0;
    console.log('JavaScript Errors:', hasErrors ? '❌' : '✅');

    console.groupEnd();

    return {
        theme: themeWorking,
        viewport: viewportWidth,
        features,
        css: { loaded: loadedImages.length, total: stylesheets.length },
        images: { loaded: loadedImages.length, total: images.length },
        errors: hasErrors
    };
}

// Run health check on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(runHealthCheck, 2000);
});

// Make available globally
window.runHealthCheck = runHealthCheck;
```

This troubleshooting guide provides comprehensive solutions for common issues that may arise during development and deployment of the Mikrotik Billing System frontend.