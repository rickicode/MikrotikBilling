# Animation Usage Guide

## Table of Contents
1. [Animation Principles](#animation-principles)
2. [Animation Categories](#animation-categories)
3. [Performance Guidelines](#performance-guidelines)
4. [Accessibility Considerations](#accessibility-considerations)
5. [Component Animations](#component-animations)
6. [Page Transitions](#page-transitions)
7. [Loading States](#loading-states)
8. [Micro-interactions](#micro-interactions)
9. [Mobile Animations](#mobile-animations)
10. [Best Practices](#best-practices)

---

## Animation Principles

### Purposeful Animation
```css
/* Animations should serve a purpose */
.btn {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Purpose: Indicates interactive element */
```

### Timing and Duration
```css
/* Standard duration categories */
.duration-fast { animation-duration: 150ms; }    /* Quick feedback */
.duration-normal { animation-duration: 300ms; }  /* Standard transitions */
.duration-slow { animation-duration: 500ms; }    /* Complex animations */

/* Easing functions for different contexts */
.ease-in { /* Entering screen */ }
.ease-out { /* Leaving screen */ }
.ease-in-out { /* State changes */ }
.ease-bounce { /* Playful interactions */
    animation-timing-function: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
```

### Natural Motion
```css
/* Gravity-based animations */
@keyframes dropIn {
    0% {
        transform: translateY(-100px);
        opacity: 0;
    }
    60% {
        transform: translateY(10px);
    }
    80% {
        transform: translateY(-5px);
    }
    100% {
        transform: translateY(0);
        opacity: 1;
    }
}

/* Spring-like animations */
@keyframes spring {
    0% { transform: scale(1); }
    30% { transform: scale(1.25); }
    60% { transform: scale(0.8); }
    100% { transform: scale(1); }
}
```

---

## Animation Categories

### Page Transitions
```css
/* Fade transition */
.page-fade-enter {
    opacity: 0;
}

.page-fade-enter-active {
    opacity: 1;
    transition: opacity 0.3s ease-out;
}

.page-fade-exit {
    opacity: 1;
}

.page-fade-exit-active {
    opacity: 0;
    transition: opacity 0.2s ease-in;
}

/* Slide transition */
.page-slide-enter {
    transform: translateX(100%);
    opacity: 0;
}

.page-slide-enter-active {
    transform: translateX(0);
    opacity: 1;
    transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.page-slide-exit {
    transform: translateX(0);
    opacity: 1;
}

.page-slide-exit-active {
    transform: translateX(-100%);
    opacity: 0;
    transition: transform 0.3s ease-in, opacity 0.3s ease-in;
}
```

### Component Animations
```css
/* Card hover lift */
.card-hover-lift {
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card-hover-lift:hover {
    transform: translateY(-8px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

/* Button ripple effect */
.btn-ripple {
    position: relative;
    overflow: hidden;
}

.btn-ripple::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
}

.btn-ripple:active::before {
    width: 300px;
    height: 300px;
}

/* Modal slide-up */
.modal-slide-up-enter {
    transform: translateY(100%);
    opacity: 0;
}

.modal-slide-up-enter-active {
    transform: translateY(0);
    opacity: 1;
    transition: transform 0.4s ease-out, opacity 0.4s ease-out;
}
```

### Loading Animations
```css
/* Pulse loading */
@keyframes pulse {
    0%, 100% {
        opacity: 1;
    }
    50% {
        opacity: 0.4;
    }
}

.loading-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Spin loading */
@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

.loading-spin {
    animation: spin 1s linear infinite;
}

/* Skeleton loading */
@keyframes shimmer {
    0% {
        background-position: -200px 0;
    }
    100% {
        background-position: calc(200px + 100%) 0;
    }
}

.skeleton-shimmer {
    background: linear-gradient(
        90deg,
        rgba(156, 163, 175, 0.2) 0%,
        rgba(156, 163, 175, 0.4) 50%,
        rgba(156, 163, 175, 0.2) 100%
    );
    background-size: 200px 100%;
    animation: shimmer 1.5s infinite;
}
```

---

## Performance Guidelines

### GPU Acceleration
```css
/* Use transform and opacity for smooth animations */
.smooth-animation {
    transform: translateZ(0); /* Force GPU layer */
    will-change: transform, opacity; /* Hint browser */
    transition: transform 0.3s ease, opacity 0.3s ease;
}

/* Avoid animating these properties */
.poor-performance {
    /* Don't animate: width, height, padding, margin */
    /* Don't animate: left, top, right, bottom */
}
```

### Efficient Selectors
```css
/* Good: Specific classes */
.animation-target {
    transition: transform 0.3s ease;
}

/* Avoid: Universal selectors */
* {
    /* Don't apply animations to all elements */
}

/* Avoid: Deep nesting */
.overly-specific .nested .animation .selector {
    /* Too specific, hard to maintain */
}
```

### Animation Cleanup
```javascript
class AnimationManager {
    constructor() {
        this.activeAnimations = new Set();
        this.init();
    }

    init() {
        // Clean up animations when elements are removed
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.removedNodes.forEach(node => {
                    this.cleanupAnimations(node);
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    startAnimation(element, animationName) {
        const animationId = `${animationName}-${Date.now()}`;
        this.activeAnimations.add(animationId);

        element.addEventListener('animationend', () => {
            this.activeAnimations.delete(animationId);
        }, { once: true });
    }

    cleanupAnimations(element) {
        // Remove inline styles and event listeners
        element.removeAttribute('style');
        element.classList.remove('animating');
    }

    pauseAllAnimations() {
        document.querySelectorAll('[class*="animate"]').forEach(el => {
            el.style.animationPlayState = 'paused';
        });
    }

    resumeAllAnimations() {
        document.querySelectorAll('[class*="animate"]').forEach(el => {
            el.style.animationPlayState = 'running';
        });
    }
}
```

---

## Accessibility Considerations

### Respect User Preferences
```css
/* Respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}

/* Provide alternatives for motion-sensitive users */
@media (prefers-reduced-motion: no-preference) {
    .enhanced-animation {
        animation: slideIn 0.5s ease-out;
    }
}

.reduced-motion-fallback {
    /* Static alternative */
    opacity: 1;
    transform: none;
}
```

### Accessible Animations
```html
<!-- Animated loading with progress -->
<div class="loading-container" role="status" aria-live="polite">
    <div class="loading-spinner" aria-hidden="true"></div>
    <p class="loading-text">Loading customer data... 50%</p>
</div>

<!-- Auto-dismissing toast with announcement -->
<div class="toast" role="alert" aria-live="assertive">
    <div class="toast-content">
        Customer created successfully!
    </div>
    <div class="toast-progress" style="animation: countdown 5s linear forwards"></div>
</div>
```

### Focus Management During Animations
```javascript
class AccessibleAnimation {
    static animateWithFocus(element, animation, options = {}) {
        // Preserve focus during animations
        const originalFocus = document.activeElement;

        element.addEventListener('animationstart', () => {
            // Prevent tabbing during animation if needed
            if (options.trapFocus) {
                element.setAttribute('aria-busy', 'true');
            }
        });

        element.addEventListener('animationend', () => {
            // Restore accessibility state
            element.removeAttribute('aria-busy');

            if (options.restoreFocus && originalFocus) {
                originalFocus.focus();
            }
        });

        element.classList.add(animation);
    }
}
```

---

## Component Animations

### Button Animations
```css
/* Hover states */
.btn-hover-lift {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn-hover-lift:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-hover-glow:hover {
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
}

/* Loading states */
.btn-loading {
    position: relative;
    color: transparent;
}

.btn-loading::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    border: 2px solid currentColor;
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 1s linear infinite;
}

/* Success states */
.btn-success {
    animation: success-pulse 0.6s ease;
}

@keyframes success-pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
}
```

### Card Animations
```css
/* Entry animations */
.card-enter {
    animation: cardSlideIn 0.5s ease-out;
}

@keyframes cardSlideIn {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Staggered card animations */
.card-stagger-1 { animation-delay: 0.1s; }
.card-stagger-2 { animation-delay: 0.2s; }
.card-stagger-3 { animation-delay: 0.3s; }
.card-stagger-4 { animation-delay: 0.4s; }

/* Card hover effects */
.card-hover-effect {
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card-hover-effect:hover {
    transform: translateY(-8px) scale(1.02);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

/* Card background animations */
.card-animated-bg {
    background-size: 200% 200%;
    background-position: 50% 50%;
    transition: background-position 0.5s ease;
}

.card-animated-bg:hover {
    background-position: 0% 100%;
}
```

### Form Animations
```css
/* Input focus animations */
.form-input-animated {
    transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;
}

.form-input-animated:focus {
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);
}

/* Label float animation */
.form-floating-label {
    position: relative;
}

.form-floating-label .form-input-animated:focus + .form-label,
.form-floating-label .form-input-animated:not(:placeholder-shown) + .form-label {
    transform: translateY(-1.5rem) scale(0.85);
    color: var(--primary-500);
}

/* Error shake animation */
.form-error-shake {
    animation: shake 0.5s ease-in-out;
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
}

/* Success checkmark animation */
.form-success-checkmark {
    animation: checkmark-pop 0.6s ease;
}

@keyframes checkmark-pop {
    0% { transform: scale(0) rotate(45deg); }
    50% { transform: scale(1.2) rotate(45deg); }
    100% { transform: scale(1) rotate(45deg); }
}
```

### Modal Animations
```css
/* Backdrop fade */
.modal-backdrop-enter {
    opacity: 0;
}

.modal-backdrop-enter-active {
    opacity: 1;
    transition: opacity 0.3s ease;
}

.modal-backdrop-exit {
    opacity: 1;
}

.modal-backdrop-exit-active {
    opacity: 0;
    transition: opacity 0.3s ease;
}

/* Content slide up */
.modal-content-enter {
    transform: translateY(100px) scale(0.9);
    opacity: 0;
}

.modal-content-enter-active {
    transform: translateY(0) scale(1);
    opacity: 1;
    transition: transform 0.4s ease, opacity 0.4s ease;
}

.modal-content-exit {
    transform: translateY(0) scale(1);
    opacity: 1;
}

.modal-content-exit-active {
    transform: translateY(100px) scale(0.9);
    opacity: 0;
    transition: transform 0.3s ease, opacity 0.3s ease;
}
```

---

## Page Transitions

### Route-based Transitions
```javascript
class PageTransitionManager {
    constructor() {
        this.currentPage = null;
        this.transitionDuration = 300;
        this.init();
    }

    init() {
        // Intercept navigation
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (link && !link.target && !link.hasAttribute('data-no-transition')) {
                e.preventDefault();
                this.navigateTo(link.href);
            }
        });
    }

    async navigateTo(url) {
        // Start exit animation
        await this.exitPage();

        // Load new content
        const content = await this.fetchPage(url);

        // Update DOM
        this.updateContent(content);

        // Start enter animation
        await this.enterPage();

        // Update history
        history.pushState({}, '', url);
    }

    async exitPage() {
        const main = document.querySelector('main');
        main.classList.add('page-transition-exit');

        return new Promise(resolve => {
            setTimeout(resolve, this.transitionDuration);
        });
    }

    async enterPage() {
        const main = document.querySelector('main');
        main.classList.remove('page-transition-exit');
        main.classList.add('page-transition-enter');

        return new Promise(resolve => {
            setTimeout(() => {
                main.classList.remove('page-transition-enter');
                resolve();
            }, this.transitionDuration);
        });
    }

    async fetchPage(url) {
        const response = await fetch(url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.querySelector('main').innerHTML;
    }

    updateContent(content) {
        const main = document.querySelector('main');
        main.innerHTML = content;

        // Reinitialize components
        this.reinitializeComponents();
    }
}
```

### Loading States
```html
<!-- Skeleton page loading -->
<div class="skeleton-page">
    <div class="skeleton-header">
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-subtitle"></div>
    </div>

    <div class="skeleton-content">
        <div class="skeleton-card">
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>

        <div class="skeleton-table">
            <div class="skeleton-table-header"></div>
            <div class="skeleton-table-row"></div>
            <div class="skeleton-table-row"></div>
        </div>
    </div>
</div>

<!-- Progress bar loading -->
<div class="loading-page">
    <div class="loading-progress">
        <div class="loading-progress-bar" style="animation: progress 2s ease-out forwards"></div>
    </div>
    <div class="loading-spinner">
        <svg class="animate-spin h-12 w-12" fill="none" viewBox="0 0 24 24">
            <!-- Spinner icon -->
        </svg>
    </div>
    <p class="loading-text">Loading dashboard...</p>
</div>
```

---

## Loading States

### Progressive Loading
```css
/* Progressive image loading */
.image-progressive {
    position: relative;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
}

.image-progressive img {
    opacity: 0;
    transition: opacity 0.3s ease;
}

.image-progressive.loaded img {
    opacity: 1;
}

.image-progressive.loaded {
    background: none;
    animation: none;
}

/* Staggered content loading */
.content-stagger > * {
    opacity: 0;
    transform: translateY(20px);
}

.content-stagger.loaded > * {
    opacity: 1;
    transform: translateY(0);
    animation: fadeInUp 0.5s ease forwards;
}

.content-stagger.loaded > *:nth-child(1) { animation-delay: 0.1s; }
.content-stagger.loaded > *:nth-child(2) { animation-delay: 0.2s; }
.content-stagger.loaded > *:nth-child(3) { animation-delay: 0.3s; }
.content-stagger.loaded > *:nth-child(4) { animation-delay: 0.4s; }
.content-stagger.loaded > *:nth-child(5) { animation-delay: 0.5s; }

@keyframes fadeInUp {
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

### Loading Indicators
```css
/* Pulse loading indicator */
.loading-pulse-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.loading-pulse-indicator span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: pulse-dots 1.4s infinite ease-in-out both;
}

.loading-pulse-indicator span:nth-child(1) { animation-delay: -0.32s; }
.loading-pulse-indicator span:nth-child(2) { animation-delay: -0.16s; }
.loading-pulse-indicator span:nth-child(3) { animation-delay: 0s; }

@keyframes pulse-dots {
    0%, 80%, 100% {
        transform: scale(0.8);
        opacity: 0.5;
    }
    40% {
        transform: scale(1);
        opacity: 1;
    }
}

/* Bounce loading indicator */
.loading-bounce-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.loading-bounce-indicator span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: bounce-dots 1.4s infinite ease-in-out both;
}

.loading-bounce-indicator span:nth-child(1) { animation-delay: -0.32s; }
.loading-bounce-indicator span:nth-child(2) { animation-delay: -0.16s; }
.loading-bounce-indicator span:nth-child(3) { animation-delay: 0s; }

@keyframes bounce-dots {
    0%, 80%, 100% {
        transform: scale(0);
    }
    40% {
        transform: scale(1);
    }
}
```

---

## Micro-interactions

### Hover Effects
```css
/* Magnetic button effect */
.btn-magnetic {
    position: relative;
    transition: transform 0.2s ease;
}

.btn-magnetic:hover {
    transform: scale(1.05) rotate(1deg);
}

/* Icon rotation */
.icon-rotate-hover:hover {
    animation: iconRotate 0.3s ease;
}

@keyframes iconRotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Color shift on hover */
.color-shift-hover {
    background: linear-gradient(45deg, #3b82f6, #8b5cf6);
    background-size: 200% 200%;
    transition: background-position 0.3s ease;
}

.color-shift-hover:hover {
    background-position: 100% 100%;
}
```

### Click Interactions
```css
/* Button press effect */
.btn-press {
    transition: transform 0.1s ease;
}

.btn-press:active {
    transform: scale(0.95);
}

/* Ripple effect */
.ripple-effect {
    position: relative;
    overflow: hidden;
}

.ripple-effect::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
}

.ripple-effect:active::after {
    width: 300px;
    height: 300px;
}
```

### Form Micro-interactions
```css
/* Input label animation */
.form-label-float {
    transition: transform 0.3s ease, color 0.3s ease, font-size 0.3s ease;
}

.form-input:focus + .form-label-float,
.form-input:not(:placeholder-shown) + .form-label-float {
    transform: translateY(-1.5rem) scale(0.85);
    color: var(--primary-500);
}

/* Checkbox animation */
.checkbox-custom {
    position: relative;
    transition: all 0.3s ease;
}

.checkbox-custom:checked {
    animation: checkboxPop 0.3s ease;
}

@keyframes checkboxPop {
    0% { transform: scale(1); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
}

/* Success animation */
.form-success-animation {
    animation: successPulse 0.6s ease;
}

@keyframes successPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
}
```

---

## Mobile Animations

### Touch Interactions
```css
/* Pull to refresh */
.pull-to-refresh {
    position: relative;
    transition: transform 0.3s ease;
}

.pull-to-refresh.pulling {
    transform: translateY(60px);
}

.pull-to-refresh.refreshing {
    animation: refreshPulse 1s ease infinite;
}

@keyframes refreshPulse {
    0%, 100% { transform: translateY(60px) scale(1); }
    50% { transform: translateY(60px) scale(1.05); }
}

/* Swipe gestures */
.swipe-container {
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
}

.swipe-item {
    scroll-snap-align: center;
    transition: transform 0.3s ease;
}

.swipe-item.active {
    transform: scale(1.05);
}

/* Floating action button */
.fab {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--primary-500);
    color: white;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    z-index: 1000;
}

.fab:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.fab:active {
    transform: scale(0.95);
}
```

### Mobile Optimizations
```css
/* Reduced motion for mobile performance */
@media (max-width: 768px) {
    .mobile-reduced {
        animation-duration: 0.2s !important;
        transition-duration: 0.2s !important;
    }

    .mobile-no-transform {
        transform: none !important;
    }

    .mobile-simple-hover:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
}

/* Touch-optimized animations */
.touch-target {
    min-height: 44px;
    min-width: 44px;
    transition: background-color 0.2s ease;
}

.touch-target:active {
    background-color: rgba(0, 0, 0, 0.1);
}

/* Haptic feedback simulation */
@keyframes haptic-feedback {
    0%, 100% { transform: scale(1); }
    25% { transform: scale(0.98); }
    75% { transform: scale(1.02); }
}

.haptic-feedback {
    animation: haptic-feedback 0.1s ease;
}
```

---

## Best Practices

### Animation Guidelines
```css
/* DO: Use transform and opacity */
.smooth-animation {
    transform: translateX(0);
    opacity: 1;
    transition: transform 0.3s ease, opacity 0.3s ease;
}

/* DON'T: Animate layout properties */
.poor-performance {
    /* Avoid: width, height, padding, margin */
    /* Avoid: left, top, right, bottom */
}

/* DO: Use meaningful easing */
.ease-meaningful {
    /* Ease-out for entering elements */
    transition: transform 0.3s ease-out;
}

.ease-meaningful-exit {
    /* Ease-in for exiting elements */
    transition: transform 0.3s ease-in;
}

/* DON'T: Over-animate */
.subtle-animation {
    /* One property at a time */
    transition: transform 0.2s ease;
}

/* Avoid: complex multi-property animations */
```

### Performance Checklist
```javascript
// Animation performance monitoring
class AnimationPerformance {
    static measureAnimation(element, animationName) {
        const startTime = performance.now();

        element.addEventListener('animationend', () => {
            const endTime = performance.now();
            const duration = endTime - startTime;

            if (duration > 100) {
                console.warn(`Animation ${animationName} took ${duration}ms - consider optimizing`);
            }
        });
    }

    static monitorFrameRate() {
        let lastTime = performance.now();
        let frames = 0;

        function checkFrameRate() {
            frames++;
            const currentTime = performance.now();

            if (currentTime >= lastTime + 1000) {
                const fps = Math.round((frames * 1000) / (currentTime - lastTime));

                if (fps < 55) {
                    console.warn(`Low frame rate detected: ${fps} FPS`);
                }

                frames = 0;
                lastTime = currentTime;
            }

            requestAnimationFrame(checkFrameRate);
        }

        requestAnimationFrame(checkFrameRate);
    }
}
```

### Animation Testing
```javascript
// Test animation accessibility
class AnimationTester {
    static testReducedMotion() {
        // Check if animations respect prefers-reduced-motion
        const testElement = document.createElement('div');
        testElement.style.animation = 'test 1s infinite';
        document.body.appendChild(testElement);

        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const hasAnimation = getComputedStyle(testElement).animationName !== 'none';

        if (mediaQuery.matches && hasAnimation) {
            console.error('Animations should be disabled when prefers-reduced-motion is set');
        }

        document.body.removeChild(testElement);
    }

    static testAnimationPerformance() {
        // Monitor animation frame rate
        let frameCount = 0;
        let startTime = performance.now();

        function countFrames() {
            frameCount++;
            const currentTime = performance.now();
            const elapsed = currentTime - startTime;

            if (elapsed >= 1000) {
                const fps = Math.round((frameCount * 1000) / elapsed);
                if (fps < 30) {
                    console.warn(`Low animation performance: ${fps} FPS`);
                }
                return;
            }

            requestAnimationFrame(countFrames);
        }

        requestAnimationFrame(countFrames);
    }
}
```

### Animation Utilities
```javascript
// Animation utility functions
class AnimationUtils {
    static animate(element, keyframes, options = {}) {
        const defaultOptions = {
            duration: 300,
            easing: 'ease-out',
            fill: 'forwards'
        };

        return element.animate(keyframes, { ...defaultOptions, ...options });
    }

    static fadeIn(element, duration = 300) {
        return this.animate(element, [
            { opacity: 0 },
            { opacity: 1 }
        ], { duration });
    }

    static fadeOut(element, duration = 300) {
        return this.animate(element, [
            { opacity: 1 },
            { opacity: 0 }
        ], { duration });
    }

    static slideIn(element, direction = 'up', distance = 20, duration = 300) {
        const transforms = {
            up: `translateY(${distance}px)`,
            down: `translateY(-${distance}px)`,
            left: `translateX(${distance}px)`,
            right: `translateX(-${distance}px)`
        };

        return this.animate(element, [
            {
                opacity: 0,
                transform: transforms[direction]
            },
            {
                opacity: 1,
                transform: 'translate(0)'
            }
        ], { duration });
    }

    static staggerAnimate(elements, animation, delay = 100) {
        return Promise.all(
            elements.map((element, index) =>
                this.animate(element, animation, {
                    delay: index * delay
                })
            )
        );
    }
}
```

This animation usage guide provides comprehensive patterns for implementing smooth, performant, and accessible animations throughout the Mikrotik Billing System while respecting user preferences and maintaining optimal performance.