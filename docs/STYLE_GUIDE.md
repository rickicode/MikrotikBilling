# Style Guide

## Design System

### Color Palette

#### Primary Colors
```css
/* Light Theme */
:root {
    --primary-50: #eff6ff;
    --primary-100: #dbeafe;
    --primary-200: #bfdbfe;
    --primary-300: #93c5fd;
    --primary-400: #60a5fa;
    --primary-500: #3b82f6;  /* Main Primary */
    --primary-600: #2563eb;
    --primary-700: #1d4ed8;
    --primary-800: #1e40af;
    --primary-900: #1e3a8a;
}

/* Dark Theme */
.dark {
    --primary-50: #1e3a8a;
    --primary-100: #1e40af;
    --primary-200: #1d4ed8;
    --primary-300: #2563eb;
    --primary-400: #3b82f6;  /* Main Primary */
    --primary-500: #60a5fa;
    --primary-600: #93c5fd;
    --primary-700: #bfdbfe;
    --primary-800: #dbeafe;
    --primary-900: #eff6ff;
}
```

#### Secondary Colors
```css
/* Gray Scale */
:root {
    --gray-50: #f9fafb;
    --gray-100: #f3f4f6;
    --gray-200: #e5e7eb;
    --gray-300: #d1d5db;
    --gray-400: #9ca3af;
    --gray-500: #6b7280;
    --gray-600: #4b5563;
    --gray-700: #374151;
    --gray-800: #1f2937;
    --gray-900: #111827;
}

.dark {
    --gray-50: #111827;
    --gray-100: #1f2937;
    --gray-200: #374151;
    --gray-300: #4b5563;
    --gray-400: #6b7280;
    --gray-500: #9ca3af;
    --gray-600: #d1d5db;
    --gray-700: #e5e7eb;
    --gray-800: #f3f4f6;
    --gray-900: #f9fafb;
}
```

#### Semantic Colors
```css
/* Success */
:root {
    --success-50: #f0fdf4;
    --success-500: #22c55e;
    --success-600: #16a34a;
}

.dark {
    --success-50: #14532d;
    --success-500: #4ade80;
    --success-600: #22c55e;
}

/* Warning */
:root {
    --warning-50: #fffbeb;
    --warning-500: #f59e0b;
    --warning-600: #d97706;
}

.dark {
    --warning-50: #451a03;
    --warning-500: #fbbf24;
    --warning-600: #f59e0b;
}

/* Danger */
:root {
    --danger-50: #fef2f2;
    --danger-500: #ef4444;
    --danger-600: #dc2626;
}

.dark {
    --danger-50: #450a0a;
    --danger-500: #f87171;
    --danger-600: #ef4444;
}
```

### Typography

#### Font Family
```css
/* Primary Font Stack */
font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;

/* Monospace Font Stack */
font-family:
    ui-monospace,
    SFMono-Regular,
    'SF Mono',
    Consolas,
    'Liberation Mono',
    Menlo,
    monospace;
```

#### Font Sizes
```css
/* Responsive Font Sizes */
.text-xs { font-size: 0.75rem; line-height: 1rem; }      /* 12px */
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }   /* 14px */
.text-base { font-size: 1rem; line-height: 1.5rem; }      /* 16px */
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }   /* 18px */
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }    /* 20px */
.text-2xl { font-size: 1.5rem; line-height: 2rem; }       /* 24px */
.text-3xl { font-size: 1.875rem; line-height: 2.25rem; }  /* 30px */
.text-4xl { font-size: 2.25rem; line-height: 2.5rem; }    /* 36px */
.text-5xl { font-size: 3rem; line-height: 1; }            /* 48px */
```

#### Font Weights
```css
.font-thin { font-weight: 100; }
.font-light { font-weight: 300; }
.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.font-extrabold { font-weight: 800; }
.font-black { font-weight: 900; }
```

### Spacing System

#### Scale
```css
/* 8px Grid System */
.space-0 { margin: 0; }
.space-1 { margin: 0.25rem; }    /* 4px */
.space-2 { margin: 0.5rem; }     /* 8px */
.space-3 { margin: 0.75rem; }    /* 12px */
.space-4 { margin: 1rem; }       /* 16px */
.space-5 { margin: 1.25rem; }    /* 20px */
.space-6 { margin: 1.5rem; }     /* 24px */
.space-8 { margin: 2rem; }       /* 32px */
.space-10 { margin: 2.5rem; }    /* 40px */
.space-12 { margin: 3rem; }      /* 48px */
.space-16 { margin: 4rem; }      /* 64px */
.space-20 { margin: 5rem; }      /* 80px */
.space-24 { margin: 6rem; }      /* 96px */
.space-32 { margin: 8rem; }      /* 128px */
```

#### Layout Spacing
```css
/* Container Padding */
.container-padding {
    padding: 1rem;  /* 16px */
}

@media (min-width: 640px) {
    .container-padding {
        padding: 1.5rem;  /* 24px */
    }
}

@media (min-width: 1024px) {
    .container-padding {
        padding: 2rem;  /* 32px */
    }
}

/* Section Spacing */
.section-spacing {
    padding: 4rem 0;  /* 64px vertical */
}

@media (min-width: 768px) {
    .section-spacing {
        padding: 6rem 0;  /* 96px vertical */
    }
}
```

### Border Radius

```css
.rounded-none { border-radius: 0; }
.rounded-sm { border-radius: 0.125rem; }   /* 2px */
.rounded { border-radius: 0.25rem; }       /* 4px */
.rounded-md { border-radius: 0.375rem; }   /* 6px */
.rounded-lg { border-radius: 0.5rem; }     /* 8px */
.rounded-xl { border-radius: 0.75rem; }    /* 12px */
.rounded-2xl { border-radius: 1rem; }      /* 16px */
.rounded-3xl { border-radius: 1.5rem; }    /* 24px */
.rounded-full { border-radius: 9999px; }
```

### Shadows

```css
/* Shadow System */
.shadow-sm {
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.shadow {
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
}

.shadow-md {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.shadow-lg {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.shadow-xl {
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.shadow-2xl {
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Dark Theme Shadows */
.dark .shadow-sm {
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.2);
}

.dark .shadow {
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px 0 rgba(0, 0, 0, 0.2);
}

.dark .shadow-md {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
}

.dark .shadow-lg {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2);
}
```

## Component Styles

### Buttons

#### Base Button
```css
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25rem;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    position: relative;
    overflow: hidden;
}

.btn:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
```

#### Button Variants
```css
/* Primary Button */
.btn-primary {
    background-color: var(--primary-500);
    color: white;
    border-color: var(--primary-500);
}

.btn-primary:hover:not(:disabled) {
    background-color: var(--primary-600);
    border-color: var(--primary-600);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

/* Secondary Button */
.btn-secondary {
    background-color: var(--gray-200);
    color: var(--gray-800);
    border-color: var(--gray-300);
}

.btn-secondary:hover:not(:disabled) {
    background-color: var(--gray-300);
    border-color: var(--gray-400);
}

.dark .btn-secondary {
    background-color: var(--gray-700);
    color: var(--gray-100);
    border-color: var(--gray-600);
}

.dark .btn-secondary:hover:not(:disabled) {
    background-color: var(--gray-600);
    border-color: var(--gray-500);
}

/* Ghost Button */
.btn-ghost {
    background-color: transparent;
    color: var(--gray-700);
    border-color: transparent;
}

.btn-ghost:hover:not(:disabled) {
    background-color: var(--gray-100);
    color: var(--gray-900);
}

.dark .btn-ghost {
    color: var(--gray-300);
}

.dark .btn-ghost:hover:not(:disabled) {
    background-color: var(--gray-800);
    color: var(--gray-100);
}
```

### Forms

#### Form Controls
```css
.form-input,
.form-textarea,
.form-select {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--gray-300);
    border-radius: 0.375rem;
    background-color: white;
    color: var(--gray-900);
    font-size: 0.875rem;
    line-height: 1.25rem;
    transition: all 0.2s ease-in-out;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
    outline: none;
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    transform: translateY(-1px);
}

.dark .form-input,
.dark .form-textarea,
.dark .form-select {
    background-color: var(--gray-800);
    border-color: var(--gray-600);
    color: var(--gray-100);
}

.dark .form-input:focus,
.dark .form-textarea:focus,
.dark .form-select:focus {
    border-color: var(--primary-400);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}
```

#### Form Labels
```css
.form-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--gray-700);
}

.dark .form-label {
    color: var(--gray-300);
}
```

### Cards

```css
.card {
    background-color: white;
    border: 1px solid var(--gray-200);
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    overflow: hidden;
    transition: all 0.2s ease-in-out;
}

.card:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
}

.dark .card {
    background-color: var(--gray-800);
    border-color: var(--gray-700);
}

.card-header {
    padding: 1.5rem 1.5rem 0;
}

.card-body {
    padding: 1.5rem;
}

.card-footer {
    padding: 0 1.5rem 1.5rem;
    background-color: var(--gray-50);
    border-top: 1px solid var(--gray-200);
}

.dark .card-footer {
    background-color: var(--gray-900);
    border-top-color: var(--gray-700);
}
```

### Tables

```css
.data-table {
    width: 100%;
    border-collapse: collapse;
    background-color: white;
    border-radius: 0.5rem;
    overflow: hidden;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.dark .data-table {
    background-color: var(--gray-800);
}

.data-table th {
    background-color: var(--gray-50);
    padding: 0.75rem 1rem;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--gray-700);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--gray-200);
}

.dark .data-table th {
    background-color: var(--gray-900);
    color: var(--gray-300);
    border-bottom-color: var(--gray-700);
}

.data-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--gray-200);
    color: var(--gray-900);
}

.dark .data-table td {
    border-bottom-color: var(--gray-700);
    color: var(--gray-100);
}

.data-table tr:hover {
    background-color: var(--gray-50);
}

.dark .data-table tr:hover {
    background-color: var(--gray-900);
}
```

## Animation Guidelines

### Transition Properties
```css
/* Standard Transitions */
.transition-colors { transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-color 0.2s ease-in-out; }
.transition-transform { transition: transform 0.2s ease-in-out; }
.transition-all { transition: all 0.2s ease-in-out; }
.transition-opacity { transition: opacity 0.2s ease-in-out; }

/* Easing Functions */
.ease-linear { transition-timing-function: linear; }
.ease-in { transition-timing-function: cubic-bezier(0.4, 0, 1, 1); }
.ease-out { transition-timing-function: cubic-bezier(0, 0, 0.2, 1); }
.ease-in-out { transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
```

### Animation Durations
```css
.duration-75 { animation-duration: 75ms; }
.duration-100 { animation-duration: 100ms; }
.duration-150 { animation-duration: 150ms; }
.duration-200 { animation-duration: 200ms; }
.duration-300 { animation-duration: 300ms; }
.duration-500 { animation-duration: 500ms; }
.duration-700 { animation-duration: 700ms; }
.duration-1000 { animation-duration: 1000ms; }
```

## Responsive Design

### Breakpoints
```css
/* Mobile-first approach */
/* sm: 640px */
@media (min-width: 640px) { }

/* md: 768px */
@media (min-width: 768px) { }

/* lg: 1024px */
@media (min-width: 1024px) { }

/* xl: 1280px */
@media (min-width: 1280px) { }

/* 2xl: 1536px */
@media (min-width: 1536px) { }
```

### Responsive Typography
```css
.text-responsive {
    font-size: 1rem;        /* 16px - Base */
    line-height: 1.5rem;
}

@media (min-width: 768px) {
    .text-responsive {
        font-size: 1.125rem;  /* 18px - Tablet */
        line-height: 1.75rem;
    }
}

@media (min-width: 1024px) {
    .text-responsive {
        font-size: 1.25rem;   /* 20px - Desktop */
        line-height: 1.75rem;
    }
}
```

## Dark Theme Implementation

### Theme Toggle
```css
.theme-toggle {
    position: relative;
    width: 3rem;
    height: 1.5rem;
    background-color: var(--gray-300);
    border-radius: 9999px;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;
}

.theme-toggle:hover {
    background-color: var(--gray-400);
}

.dark .theme-toggle {
    background-color: var(--primary-600);
}

.theme-toggle-handle {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 1.25rem;
    height: 1.25rem;
    background-color: white;
    border-radius: 50%;
    transition: transform 0.2s ease-in-out;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.dark .theme-toggle-handle {
    transform: translateX(1.5rem);
}
```

## Accessibility Standards

### Focus Styles
```css
.focus-ring {
    outline: none;
}

.focus-ring:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
}

.focus-ring.focus-visible {
    outline: 2px solid var(--primary-500);
    outline-offset: 2px;
}
```

### Screen Reader Only
```css
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.not-sr-only {
    position: static;
    width: auto;
    height: auto;
    padding: 0;
    margin: 0;
    overflow: visible;
    clip: auto;
    white-space: normal;
}
```

### Reduced Motion
```css
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
```

## Performance Guidelines

### Optimized Animations
```css
/* GPU-accelerated animations */
.gpu-accelerated {
    transform: translateZ(0);
    will-change: transform;
}

/* Use transform and opacity for smooth animations */
.smooth-animation {
    transition: transform 0.3s ease, opacity 0.3s ease;
}

/* Avoid animating these properties */
.avoid-animation {
    /* Don't animate: width, height, padding, margin */
    /* Use transform: scale() instead */
}
```

### Efficient Selectors
```css
/* Good: Class-based selectors */
.component-name { }

/* Avoid: Deep nesting */
.overly-specific .nested .selector .chain { }

/* Avoid: Universal selectors */
* { }
```

## Browser Compatibility

### CSS Custom Properties Fallback
```css
/* For browsers that don't support CSS custom properties */
.component {
    background-color: #3b82f6;  /* Fallback */
    background-color: var(--primary-500);
}

/* Feature detection */
@supports (display: grid) {
    .grid-layout {
        display: grid;
    }
}
```

### Vendor Prefixes
```css
/* Autoprefixer handles most of these */
.component {
    -webkit-transform: translateX(0);
    transform: translateX(0);

    -webkit-transition: transform 0.2s ease;
    transition: transform 0.2s ease;
}
```

This style guide provides a comprehensive foundation for consistent design and development across the Mikrotik Billing System. All components should follow these guidelines to maintain visual consistency and optimal user experience.