# Responsive Design Patterns

## Table of Contents
1. [Breakpoint System](#breakpoint-system)
2. [Layout Patterns](#layout-patterns)
3. [Navigation Patterns](#navigation-patterns)
4. [Table Patterns](#table-patterns)
5. [Form Patterns](#form-patterns)
6. [Card Patterns](#card-patterns)
7. [Mobile-First Approach](#mobile-first-approach)
8. [Touch Interactions](#touch-interactions)
9. [Performance Optimization](#performance-optimization)
10. [Testing Guidelines](#testing-guidelines)

---

## Breakpoint System

### Standard Breakpoints
```css
/* Mobile-First Breakpoint System */
/* xs: 0px - 639px (default, no media query needed) */
/* sm: 640px - 767px */
/* md: 768px - 1023px */
/* lg: 1024px - 1279px */
/* xl: 1280px - 1535px */
/* 2xl: 1536px and above */

/* Responsive mixins */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```

### Container Patterns
```html
<!-- Fixed Container -->
<div class="container mx-auto px-4 max-w-7xl">
    <!-- Content with maximum width -->
</div>

<!-- Fluid Container -->
<div class="w-full px-4 sm:px-6 lg:px-8">
    <!-- Full width with consistent padding -->
</div>

<!-- Responsive Container -->
<div class="container px-4 sm:px-6 lg:px-8">
    <!-- Responsive padding -->
</div>
```

---

## Layout Patterns

### Dashboard Layout
```html
<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Mobile Header -->
    <header class="lg:hidden bg-white dark:bg-gray-800 shadow-sm">
        <div class="flex items-center justify-between p-4">
            <h1 class="text-xl font-semibold">Dashboard</h1>
            <button class="mobile-menu-btn p-2" onclick="toggleMobileMenu()">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <!-- Menu icon -->
                </svg>
            </button>
        </div>
    </header>

    <div class="flex flex-col lg:flex-row">
        <!-- Sidebar -->
        <aside class="sidebar fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-lg lg:shadow-none transform -translate-x-full lg:translate-x-0 transition-transform duration-300">
            <!-- Sidebar content -->
        </aside>

        <!-- Main Content -->
        <main class="flex-1 min-h-screen">
            <!-- Desktop Header -->
            <header class="hidden lg:block bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
                <div class="px-4 sm:px-6 lg:px-8">
                    <div class="flex items-center justify-between h-16">
                        <!-- Header content -->
                    </div>
                </div>
            </header>

            <div class="p-4 sm:p-6 lg:p-8">
                <!-- Dashboard content -->
            </div>
        </main>
    </div>
</div>
```

### Grid Layouts
```html
<!-- Responsive Grid -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
    <div class="card">Grid Item 1</div>
    <div class="card">Grid Item 2</div>
    <div class="card">Grid Item 3</div>
    <div class="card">Grid Item 4</div>
</div>

<!-- Responsive Grid with Auto-fit -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <!-- Content -->
</div>

<!-- Responsive Grid with Min/Max Width -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    <div class="min-w-0 max-w-sm">Auto-sized content</div>
</div>
```

### Flexbox Layouts
```html
<!-- Responsive Flex Layout -->
<div class="flex flex-col sm:flex-row gap-4">
    <div class="flex-1">Content 1</div>
    <div class="flex-1">Content 2</div>
</div>

<!-- Responsive Flex with Wrap -->
<div class="flex flex-wrap gap-2 sm:gap-4">
    <div class="flex-shrink-0 w-full sm:w-auto">Item 1</div>
    <div class="flex-shrink-0 w-full sm:w-auto">Item 2</div>
</div>
```

---

## Navigation Patterns

### Mobile Navigation
```html
<!-- Mobile Menu Button -->
<button class="lg:hidden fixed top-4 right-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg" onclick="toggleMobileMenu()">
    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
    </svg>
</button>

<!-- Mobile Navigation Drawer -->
<nav class="fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 shadow-xl transform -translate-x-full lg:translate-x-0 transition-transform duration-300" id="mobileNav">
    <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold">Menu</h2>
        <button onclick="toggleMobileMenu()" class="p-2">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
    </div>

    <div class="overflow-y-auto h-full pb-20">
        <ul class="p-4 space-y-2">
            <li>
                <a href="/dashboard" class="flex items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <svg class="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <!-- Dashboard icon -->
                    </svg>
                    Dashboard
                </a>
            </li>
        </ul>
    </div>
</nav>

<!-- Mobile Navigation Overlay -->
<div class="fixed inset-0 bg-black bg-opacity-50 z-30 hidden lg:hidden" id="mobileNavOverlay" onclick="toggleMobileMenu()"></div>
```

### Bottom Navigation (Mobile)
```html
<!-- Bottom Navigation for Mobile -->
<nav class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-30 lg:hidden">
    <div class="grid grid-cols-5 gap-1">
        <a href="/dashboard" class="flex flex-col items-center p-2 text-primary-600 dark:text-primary-400">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <!-- Icon -->
            </svg>
            <span class="text-xs mt-1">Home</span>
        </a>
        <a href="/customers" class="flex flex-col items-center p-2 text-gray-600 dark:text-gray-400">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <!-- Icon -->
            </svg>
            <span class="text-xs mt-1">Customers</span>
        </a>
        <!-- More items -->
    </div>
</nav>

<!-- Add bottom padding to content on mobile -->
<div class="pb-16 lg:pb-0">
    <!-- Main content -->
</div>
```

### Responsive Header
```html
<header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
    <div class="px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
            <!-- Logo/Brand -->
            <div class="flex items-center">
                <div class="flex-shrink-0">
                    <h1 class="text-xl sm:text-2xl font-bold text-primary-600 dark:text-primary-400">
                        Brand
                    </h1>
                </div>
            </div>

            <!-- Desktop Navigation -->
            <nav class="hidden md:flex space-x-4 lg:space-x-8">
                <a href="/dashboard" class="text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 px-3 py-2 text-sm font-medium">
                    Dashboard
                </a>
                <a href="/customers" class="text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 px-3 py-2 text-sm font-medium">
                    Customers
                </a>
            </nav>

            <!-- User Menu -->
            <div class="flex items-center space-x-4">
                <button class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <!-- Notifications icon -->
                    </svg>
                </button>

                <!-- Mobile menu button -->
                <button class="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" onclick="toggleMobileMenu()">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                    </svg>
                </button>
            </div>
        </div>
    </div>
</header>
```

---

## Table Patterns

### Responsive Data Table
```html
<div class="table-container">
    <div class="overflow-x-auto sm:overflow-x-visible">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                    <th class="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Name
                    </th>
                    <th class="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Email
                    </th>
                    <th class="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                    </th>
                    <th class="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                    </th>
                </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td class="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="flex-shrink-0 h-10 w-10">
                                <img class="h-10 w-10 rounded-full" src="/avatar.jpg" alt="">
                            </div>
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">
                                    John Doe
                                </div>
                                <div class="text-sm text-gray-500 dark:text-gray-400 sm:hidden">
                                    john@example.com
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        john@example.com
                    </td>
                    <td class="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Active
                        </span>
                    </td>
                    <td class="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button class="text-primary-600 dark:text-primary-400 hover:text-primary-900 mr-3">Edit</button>
                        <button class="text-red-600 hover:text-red-900">Delete</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
```

### Card-Based Table (Mobile)
```html
<!-- Mobile: Card Layout -->
<div class="sm:hidden space-y-4">
    <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <div class="flex items-center justify-between">
            <div class="flex items-center">
                <img class="h-12 w-12 rounded-full" src="/avatar.jpg" alt="">
                <div class="ml-4">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">John Doe</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">john@example.com</p>
                </div>
            </div>
            <span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                Active
            </span>
        </div>
        <div class="mt-4 flex justify-end space-x-2">
            <button class="btn btn-sm btn-primary">Edit</button>
            <button class="btn btn-sm btn-danger">Delete</button>
        </div>
    </div>
</div>

<!-- Desktop: Table Layout -->
<div class="hidden sm:block">
    <!-- Table code from above -->
</div>
```

---

## Form Patterns

### Responsive Form Layout
```html
<form class="space-y-6">
    <!-- Single Column on Mobile, Two Columns on Desktop -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="form-group">
            <label for="firstName" class="form-label">First Name</label>
            <input type="text" id="firstName" name="firstName" class="form-input" required>
        </div>
        <div class="form-group">
            <label for="lastName" class="form-label">Last Name</label>
            <input type="text" id="lastName" name="lastName" class="form-input" required>
        </div>
    </div>

    <!-- Full Width Field -->
    <div class="form-group">
        <label for="email" class="form-label">Email Address</label>
        <input type="email" id="email" name="email" class="form-input" required>
    </div>

    <!-- Responsive Address Fields -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="form-group md:col-span-2">
            <label for="street" class="form-label">Street Address</label>
            <input type="text" id="street" name="street" class="form-input">
        </div>
        <div class="form-group">
            <label for="city" class="form-label">City</label>
            <input type="text" id="city" name="city" class="form-input">
        </div>
        <div class="form-group">
            <label for="state" class="form-label">State</label>
            <select id="state" name="state" class="form-select">
                <option value="">Select State</option>
            </select>
        </div>
    </div>

    <!-- Responsive Button Layout -->
    <div class="flex flex-col sm:flex-row gap-3 sm:justify-end">
        <button type="button" class="btn btn-secondary w-full sm:w-auto">Cancel</button>
        <button type="submit" class="btn btn-primary w-full sm:w-auto">Save</button>
    </div>
</form>
```

### Mobile-Optimized Form
```html
<form class="space-y-4">
    <!-- Mobile-friendly input groups -->
    <div class="form-group">
        <label for="mobileNumber" class="form-label">Mobile Number</label>
        <div class="flex">
            <select class="form-select rounded-l-none border-l-0">
                <option value="+1">+1</option>
                <option value="+44">+44</option>
            </select>
            <input type="tel" id="mobileNumber" name="mobileNumber" class="form-input rounded-r-none flex-1" placeholder="Phone number">
        </div>
    </div>

    <!-- Large touch targets for mobile -->
    <div class="form-group">
        <fieldset class="space-y-3">
            <legend class="form-label">Choose Option</legend>
            <div class="space-y-2">
                <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="radio" name="option" value="1" class="mr-3 h-4 w-4">
                    <span>Option 1</span>
                </label>
                <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="radio" name="option" value="2" class="mr-3 h-4 w-4">
                    <span>Option 2</span>
                </label>
            </div>
        </fieldset>
    </div>
</form>
```

---

## Card Patterns

### Responsive Card Grid
```html
<!-- Stats Cards -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
    <div class="card stat-card">
        <div class="p-4 sm:p-6">
            <div class="flex items-center">
                <div class="flex-shrink-0">
                    <div class="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                        <svg class="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <!-- Icon -->
                        </svg>
                    </div>
                </div>
                <div class="ml-4 flex-1">
                    <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                    <p class="text-2xl font-semibold text-gray-900 dark:text-white">1,234</p>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Feature Cards -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <div class="card hover:shadow-lg transition-shadow duration-300">
        <img src="/image.jpg" alt="Feature" class="w-full h-48 object-cover rounded-t-lg">
        <div class="p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Card Title</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">Card description goes here with responsive text sizing.</p>
            <button class="btn btn-primary w-full sm:w-auto">Learn More</button>
        </div>
    </div>
</div>
```

### Adaptive Card Layout
```html
<!-- Horizontal Card on Desktop, Vertical on Mobile -->
<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
    <div class="flex flex-col md:flex-row">
        <div class="md:w-1/3">
            <img src="/image.jpg" alt="Card image" class="w-full h-48 md:h-full object-cover">
        </div>
        <div class="p-6 md:w-2/3">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">Card Title</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">Card content that adapts to different screen sizes.</p>
            <div class="flex flex-col sm:flex-row gap-3">
                <button class="btn btn-primary flex-1 sm:flex-none">Primary Action</button>
                <button class="btn btn-secondary flex-1 sm:flex-none">Secondary Action</button>
            </div>
        </div>
    </div>
</div>
```

---

## Mobile-First Approach

### CSS Strategy
```css
/* Base styles (mobile-first) */
.component {
    padding: 1rem;
    font-size: 1rem;
    width: 100%;
}

/* Tablet styles */
@media (min-width: 768px) {
    .component {
        padding: 1.5rem;
        font-size: 1.125rem;
        width: auto;
    }
}

/* Desktop styles */
@media (min-width: 1024px) {
    .component {
        padding: 2rem;
        font-size: 1.25rem;
    }
}

/* Large desktop styles */
@media (min-width: 1280px) {
    .component {
        padding: 2.5rem;
        font-size: 1.5rem;
    }
}
```

### Component Structure
```html
<!-- Mobile-first component -->
<div class="component">
    <!-- Mobile: Stacked layout -->
    <div class="space-y-4 lg:space-y-0 lg:space-x-6 lg:flex lg:items-center">
        <!-- Content -->
        <div class="lg:flex-1">
            <h2 class="text-xl lg:text-2xl font-bold">Responsive Title</h2>
            <p class="text-sm lg:text-base mt-2">Responsive description</p>
        </div>

        <!-- Actions -->
        <div class="flex flex-col sm:flex-row gap-3 lg:gap-4 lg:mt-0">
            <button class="btn btn-primary flex-1 lg:flex-none">Action 1</button>
            <button class="btn btn-secondary flex-1 lg:flex-none">Action 2</button>
        </div>
    </div>
</div>
```

---

## Touch Interactions

### Touch-Friendly Buttons
```html
<!-- Minimum 44px touch targets -->
<button class="btn btn-primary p-4 min-h-[44px] min-w-[44px]">
    Large Touch Target
</button>

<!-- Touch-friendly spacing -->
<div class="grid grid-cols-2 gap-4 p-4">
    <button class="btn btn-secondary p-4 min-h-[44px]">Option 1</button>
    <button class="btn btn-secondary p-4 min-h-[44px]">Option 2</button>
</div>
```

### Swipe Gestures
```html
<!-- Swipeable card container -->
<div class="swipe-container overflow-x-auto snap-x snap-mandatory">
    <div class="flex space-x-4">
        <div class="min-w-[80vw] sm:min-w-[400px] snap-center">
            <!-- Swipeable content -->
        </div>
    </div>
</div>

<!-- Pull to refresh indicator -->
<div class="pull-to-refresh hidden">
    <div class="flex justify-center py-4">
        <svg class="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
            <!-- Spinner -->
        </svg>
    </div>
</div>
```

### Mobile Navigation Patterns
```html
<!-- Tab Bar for Mobile -->
<div class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 md:hidden">
    <div class="grid grid-cols-4 h-16">
        <a href="/home" class="flex flex-col items-center justify-center space-y-1 text-primary-600 dark:text-primary-400">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <!-- Home icon -->
            </svg>
            <span class="text-xs">Home</span>
        </a>
        <!-- More tabs -->
    </div>
</div>

<!-- Floating Action Button -->
<button class="fab fixed bottom-20 right-4 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center md:hidden">
    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <!-- Plus icon -->
    </svg>
</button>
```

---

## Performance Optimization

### Responsive Images
```html
<!-- Responsive images with srcset -->
<img src="/image-small.jpg"
     srcset="/image-small.jpg 640w,
             /image-medium.jpg 1024w,
             /image-large.jpg 1280w"
     sizes="(max-width: 640px) 100vw,
            (max-width: 1024px) 50vw,
            33vw"
     alt="Responsive image"
     loading="lazy"
     class="w-full h-auto rounded-lg">

<!-- Picture element for art direction -->
<picture>
    <source media="(min-width: 1024px)" srcset="/image-desktop.jpg">
    <source media="(min-width: 640px)" srcset="/image-tablet.jpg">
    <img src="/image-mobile.jpg" alt="Responsive image" loading="lazy">
</picture>
```

### Critical CSS
```html
<!-- Inline critical CSS for above-the-fold content -->
<style>
    /* Critical CSS for immediate rendering */
    .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .hero-title { font-size: 2rem; font-weight: bold; }
</style>

<!-- Load non-critical CSS asynchronously -->
<link rel="preload" href="/css/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/css/style.css"></noscript>
```

### Lazy Loading
```html
<!-- Intersection Observer for lazy loading -->
<div class="lazy-load" data-src="/content.html">
    <div class="skeleton-loader">
        <!-- Loading placeholder -->
    </div>
</div>

<!-- Native lazy loading for images -->
<img src="/placeholder.jpg"
     data-src="/actual-image.jpg"
     loading="lazy"
     class="lazy-image"
     alt="Lazy loaded image">
```

---

## Testing Guidelines

### Responsive Testing Checklist
- [ ] Test on mobile devices (320px - 768px)
- [ ] Test on tablet devices (768px - 1024px)
- [ ] Test on desktop (1024px+)
- [ ] Test landscape and portrait orientations
- [ ] Test touch interactions
- [ ] Test with high DPI displays
- [ ] Test with slow network connections
- [ ] Test accessibility with screen readers

### Browser Testing Matrix
```javascript
// Automated responsive tests
const breakpoints = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1920, height: 1080 }
];

breakpoints.forEach(breakpoint => {
    testResponsiveLayout(breakpoint);
});
```

### Performance Metrics
- First Contentful Paint (FCP) < 1.8s
- Largest Contentful Paint (LCP) < 2.5s
- First Input Delay (FID) < 100ms
- Cumulative Layout Shift (CLS) < 0.1

### Touch Testing
- Test minimum touch target sizes (44px)
- Test gesture support (swipe, pinch-to-zoom)
- Test hover states on touch devices
- Test input field focus and keyboard

This responsive design pattern guide ensures consistent, accessible, and performant experiences across all devices and screen sizes in the Mikrotik Billing System.