# Component Documentation Guide

## Table of Contents
1. [Base Components](#base-components)
2. [Form Components](#form-components)
3. [Button System](#button-system)
4. [Card Components](#card-components)
5. [Table Components](#table-components)
6. [Navigation Components](#navigation-components)
7. [Modal Components](#modal-components)
8. [Notification Components](#notification-components)
9. [Loading Components](#loading-components)
10. [Animation Components](#animation-components)

---

## Base Components

### Layout Structure
```html
<!-- Base Layout Structure -->
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Title</title>
    <!-- Critical CSS inline -->
    <style>
        /* Critical path CSS */
    </style>
    <!-- Preload non-critical CSS -->
    <link rel="preload" href="/css/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
</head>
<body class="bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
    <!-- Skip to content link for accessibility -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <!-- Header content -->
    </header>

    <!-- Main Content -->
    <main id="main-content" class="main-content">
        <!-- Page content -->
    </main>

    <!-- Footer -->
    <footer class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
        <!-- Footer content -->
    </footer>

    <!-- Scripts -->
    <script src="/js/main.js"></script>
</body>
</html>
```

### Container Components
```html
<!-- Responsive Container -->
<div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Content -->
</div>

<!-- Max Width Container -->
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Content -->
</div>

<!-- Fluid Container -->
<div class="w-full px-4 sm:px-6 lg:px-8">
    <!-- Content -->
</div>
```

---

## Form Components

### Input Fields
```html
<!-- Standard Input -->
<div class="form-group">
    <label for="field-id" class="form-label">Label Text</label>
    <input
        type="text"
        id="field-id"
        name="field-name"
        class="form-input"
        placeholder="Enter text..."
        required
        aria-describedby="field-help"
    >
    <div id="field-help" class="form-help">
        Helper text goes here
    </div>
</div>

<!-- Input with Icon -->
<div class="form-group">
    <label for="email" class="form-label">Email Address</label>
    <div class="relative">
        <input
            type="email"
            id="email"
            name="email"
            class="form-input pl-10"
            placeholder="Enter email..."
        >
        <svg class="form-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <!-- Email icon -->
        </svg>
    </div>
</div>

<!-- Textarea -->
<div class="form-group">
    <label for="message" class="form-label">Message</label>
    <textarea
        id="message"
        name="message"
        rows="4"
        class="form-textarea"
        placeholder="Enter your message..."
    ></textarea>
</div>

<!-- Select Dropdown -->
<div class="form-group">
    <label for="category" class="form-label">Category</label>
    <select id="category" name="category" class="form-select">
        <option value="">Select a category</option>
        <option value="option1">Option 1</option>
        <option value="option2">Option 2</option>
    </select>
</div>
```

### Checkboxes and Radio Buttons
```html
<!-- Checkbox -->
<div class="form-group">
    <label class="form-checkbox">
        <input type="checkbox" name="terms" class="checkbox-input">
        <span class="checkbox-checkmark"></span>
        <span class="checkbox-label">I agree to the terms and conditions</span>
    </label>
</div>

<!-- Radio Button Group -->
<div class="form-group">
    <label class="form-label">Payment Method</label>
    <div class="space-y-2">
        <label class="form-radio">
            <input type="radio" name="payment" value="cash" class="radio-input">
            <span class="radio-checkmark"></span>
            <span class="radio-label">Cash</span>
        </label>
        <label class="form-radio">
            <input type="radio" name="payment" value="card" class="radio-input">
            <span class="radio-checkmark"></span>
            <span class="radio-label">Credit Card</span>
        </label>
    </div>
</div>
```

---

## Button System

### Button Variants
```html
<!-- Primary Button -->
<button class="btn btn-primary">
    <span class="btn-text">Primary Action</span>
    <span class="btn-loader hidden">
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <!-- Spinner icon -->
        </svg>
    </span>
</button>

<!-- Secondary Button -->
<button class="btn btn-secondary">Secondary Action</button>

<!-- Success Button -->
<button class="btn btn-success">Success Action</button>

<!-- Warning Button -->
<button class="btn btn-warning">Warning Action</button>

<!-- Danger Button -->
<button class="btn btn-danger">Delete Action</button>

<!-- Ghost Button -->
<button class="btn btn-ghost">Ghost Action</button>

<!-- Outline Button -->
<button class="btn btn-outline-primary">Outline Action</button>
```

### Button Sizes
```html
<!-- Small Button -->
<button class="btn btn-primary btn-sm">Small</button>

<!-- Default Button -->
<button class="btn btn-primary">Default</button>

<!-- Large Button -->
<button class="btn btn-primary btn-lg">Large</button>

<!-- Extra Large Button -->
<button class="btn btn-primary btn-xl">Extra Large</button>
```

### Button States
```html
<!-- Loading State -->
<button class="btn btn-primary loading" disabled>
    <span class="btn-text">Processing...</span>
    <span class="btn-loader">
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <!-- Spinner icon -->
        </svg>
    </span>
</button>

<!-- Disabled State -->
<button class="btn btn-primary" disabled>Disabled</button>

<!-- Active State -->
<button class="btn btn-primary active">Active</button>
```

---

## Card Components

### Basic Card
```html
<div class="card">
    <div class="card-header">
        <h3 class="card-title">Card Title</h3>
        <p class="card-subtitle">Card subtitle or description</p>
    </div>
    <div class="card-body">
        <p class="card-text">Card content goes here.</p>
    </div>
    <div class="card-footer">
        <button class="btn btn-primary btn-sm">Action</button>
    </div>
</div>
```

### Stat Card
```html
<div class="card stat-card">
    <div class="card-body">
        <div class="flex items-center justify-between">
            <div>
                <p class="stat-label">Total Users</p>
                <p class="stat-value">1,234</p>
                <p class="stat-change positive">
                    <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <!-- Up arrow icon -->
                    </svg>
                    +12% from last month
                </p>
            </div>
            <div class="stat-icon">
                <svg class="h-8 w-8 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <!-- User icon -->
                </svg>
            </div>
        </div>
    </div>
</div>
```

### Interactive Card
```html
<div class="card card-hover card-clickable" onclick="handleCardClick()">
    <div class="card-body">
        <div class="card-badge">New</div>
        <h3 class="card-title">Interactive Card</h3>
        <p class="card-text">Click to interact with this card</p>
        <div class="card-actions">
            <button class="btn btn-ghost btn-sm">Learn More</button>
        </div>
    </div>
</div>
```

---

## Table Components

### Data Table
```html
<div class="table-container">
    <div class="table-header">
        <div class="table-title">User Management</div>
        <div class="table-actions">
            <button class="btn btn-primary btn-sm">Add User</button>
            <button class="btn btn-ghost btn-sm">Export</button>
        </div>
    </div>

    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th class="sortable" onclick="sortTable('name')">
                        Name
                        <svg class="sort-icon" fill="currentColor" viewBox="0 0 20 20">
                            <!-- Sort icon -->
                        </svg>
                    </th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <tr class="table-row-hover">
                    <td class="font-medium">John Doe</td>
                    <td>john@example.com</td>
                    <td>
                        <span class="status-badge status-success">Active</span>
                    </td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-ghost btn-xs" title="Edit">
                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <!-- Edit icon -->
                                </svg>
                            </button>
                            <button class="btn btn-ghost btn-xs text-red-600" title="Delete">
                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <!-- Delete icon -->
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="table-footer">
        <div class="table-info">
            Showing 1-10 of 50 results
        </div>
        <div class="table-pagination">
            <button class="btn btn-ghost btn-sm" disabled>Previous</button>
            <button class="btn btn-primary btn-sm">1</button>
            <button class="btn btn-ghost btn-sm">2</button>
            <button class="btn btn-ghost btn-sm">3</button>
            <button class="btn btn-ghost btn-sm">Next</button>
        </div>
    </div>
</div>
```

---

## Navigation Components

### Mobile Navigation
```html
<!-- Mobile Menu Button -->
<button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Toggle mobile menu">
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
</button>

<!-- Mobile Navigation -->
<nav class="mobile-nav" id="mobileMenu">
    <div class="mobile-nav-header">
        <h2 class="mobile-nav-title">Navigation</h2>
        <button class="mobile-nav-close" onclick="toggleMobileMenu()">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <!-- Close icon -->
            </svg>
        </button>
    </div>

    <ul class="mobile-nav-list">
        <li class="mobile-nav-item">
            <a href="/dashboard" class="mobile-nav-link active">
                <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <!-- Dashboard icon -->
                </svg>
                Dashboard
            </a>
        </li>
    </ul>
</nav>
```

### Sidebar Navigation
```html
<aside class="sidebar">
    <div class="sidebar-header">
        <div class="sidebar-logo">
            <!-- Logo -->
        </div>
    </div>

    <nav class="sidebar-nav">
        <ul class="sidebar-nav-list">
            <li class="sidebar-nav-item">
                <a href="/dashboard" class="sidebar-nav-link active">
                    <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <!-- Dashboard icon -->
                    </svg>
                    <span>Dashboard</span>
                </a>
            </li>

            <li class="sidebar-nav-item">
                <div class="sidebar-nav-group">
                    <button class="sidebar-nav-group-toggle" onclick="toggleNavGroup('management')">
                        <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <!-- Management icon -->
                        </svg>
                        <span>Management</span>
                        <svg class="nav-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <!-- Arrow icon -->
                        </svg>
                    </button>
                    <ul class="sidebar-nav-sublist" id="management-submenu">
                        <li class="sidebar-nav-subitem">
                            <a href="/customers" class="sidebar-nav-sublink">Customers</a>
                        </li>
                    </ul>
                </div>
            </li>
        </ul>
    </nav>
</aside>
```

---

## Modal Components

### Basic Modal
```html
<!-- Modal Trigger -->
<button class="btn btn-primary" onclick="openModal('exampleModal')">Open Modal</button>

<!-- Modal -->
<div class="modal" id="exampleModal">
    <div class="modal-backdrop" onclick="closeModal('exampleModal')"></div>
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">Modal Title</h3>
            <button class="modal-close" onclick="closeModal('exampleModal')" aria-label="Close modal">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <!-- Close icon -->
                </svg>
            </button>
        </div>

        <div class="modal-body">
            <p>Modal content goes here.</p>
        </div>

        <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal('exampleModal')">Cancel</button>
            <button class="btn btn-primary" onclick="confirmAction()">Confirm</button>
        </div>
    </div>
</div>
```

### Confirmation Modal
```html
<div class="modal modal-sm" id="confirmModal">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
        <div class="modal-body text-center">
            <div class="modal-icon modal-icon-warning">
                <svg class="h-12 w-12 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <!-- Warning icon -->
                </svg>
            </div>
            <h3 class="modal-title">Confirm Action</h3>
            <p class="modal-text">Are you sure you want to delete this item?</p>
        </div>
        <div class="modal-footer justify-center">
            <button class="btn btn-ghost" onclick="closeModal('confirmModal')">Cancel</button>
            <button class="btn btn-danger" onclick="confirmDelete()">Delete</button>
        </div>
    </div>
</div>
```

---

## Notification Components

### Toast Notifications
```html
<!-- Toast Container -->
<div class="toast-container" id="toastContainer"></div>

<!-- Toast Types -->
<div class="toast toast-success">
    <div class="toast-icon">
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <!-- Success icon -->
        </svg>
    </div>
    <div class="toast-content">
        <div class="toast-title">Success</div>
        <div class="toast-message">Action completed successfully</div>
    </div>
    <button class="toast-close" onclick="closeToast(this)">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <!-- Close icon -->
        </svg>
    </button>
</div>
```

### Alert Notifications
```html
<div class="alert alert-success" role="alert">
    <div class="alert-icon">
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <!-- Success icon -->
        </svg>
    </div>
    <div class="alert-content">
        <div class="alert-title">Success</div>
        <div class="alert-message">Your changes have been saved.</div>
    </div>
    <button class="alert-close" onclick="closeAlert(this)">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <!-- Close icon -->
        </svg>
    </button>
</div>
```

---

## Loading Components

### Skeleton Loaders
```html
<!-- Card Skeleton -->
<div class="skeleton-card">
    <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>
    </div>
    <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line long"></div>
    </div>
</div>

<!-- Table Skeleton -->
<div class="skeleton-table">
    <div class="skeleton-table-header">
        <div class="skeleton-cell"></div>
        <div class="skeleton-cell"></div>
        <div class="skeleton-cell"></div>
    </div>
    <div class="skeleton-table-row">
        <div class="skeleton-cell"></div>
        <div class="skeleton-cell"></div>
        <div class="skeleton-cell"></div>
    </div>
</div>
```

### Loading States
```html
<!-- Page Loading -->
<div class="page-loading">
    <div class="loading-spinner">
        <svg class="animate-spin h-12 w-12" fill="none" viewBox="0 0 24 24">
            <!-- Spinner icon -->
        </svg>
    </div>
    <p class="loading-text">Loading...</p>
</div>

<!-- Inline Loading -->
<div class="inline-loading">
    <svg class="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
        <!-- Spinner icon -->
    </svg>
    Processing...
</div>
```

---

## Animation Components

### Page Transitions
```html
<!-- Page with transition -->
<div class="page-transition">
    <div class="page-transition-content">
        <!-- Page content -->
    </div>
</div>
```

### Hover Effects
```html
<!-- Button with hover effect -->
<button class="btn btn-primary btn-hover-lift">Hover Me</button>

<!-- Card with hover effect -->
<div class="card card-hover-lift">Hover Card</div>

<!-- Link with hover effect -->
<a href="#" class="nav-link-hover">Hover Link</a>
```

### Animated Elements
```html
<!-- Fade in animation -->
<div class="fade-in">
    Content that fades in
</div>

<!-- Slide up animation -->
<div class="slide-up">
    Content that slides up
</div>

<!-- Pulse animation -->
<div class="pulse-loading">
    Pulsing element
</div>
```

---

## Usage Guidelines

### Accessibility
- Always include `aria-label` or `aria-labelledby` for interactive elements
- Use semantic HTML elements (`<header>`, `<nav>`, `<main>`, `<footer>`)
- Ensure keyboard navigation support
- Add `role` attributes where necessary
- Include skip links for screen readers

### Dark Theme
- Use `dark:` prefix for dark theme styles
- Ensure proper contrast ratios in both themes
- Test all components in both light and dark modes

### Responsive Design
- Use responsive breakpoints (`sm:`, `md:`, `lg:`, `xl:`)
- Test components on all device sizes
- Use mobile-first approach

### Performance
- Use CSS animations instead of JavaScript where possible
- Implement lazy loading for images and components
- Optimize for 60fps animations
- Use `transform` and `opacity` for smooth animations

### Browser Support
- Test in modern browsers (Chrome, Firefox, Safari, Edge)
- Provide fallbacks for older browsers
- Use progressive enhancement principles