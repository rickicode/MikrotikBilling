# Accessibility Guide

## Table of Contents
1. [WCAG 2.1 AA Compliance](#wcag-21-aa-compliance)
2. [Keyboard Navigation](#keyboard-navigation)
3. [Screen Reader Support](#screen-reader-support)
4. [Color and Contrast](#color-and-contrast)
5. [Focus Management](#focus-management)
6. [ARIA Implementation](#aria-implementation)
7. [Forms Accessibility](#forms-accessibility)
8. [Table Accessibility](#table-accessibility)
9. [Mobile Accessibility](#mobile-accessibility)
10. [Testing Guidelines](#testing-guidelines)

---

## WCAG 2.1 AA Compliance

### Level A Requirements
- [ ] All non-text content has text alternatives
- [ ] All video content has captions and audio descriptions
- [ ] Content is structured with proper headings
- [ ] Page titles are descriptive
- [ ] Link purpose is clear from text alone
- [ ] Component state changes are announced
- [ ] Forms have proper labels and instructions
- [ ] Navigation is consistent and predictable

### Level AA Requirements
- [ ] Text contrast ratio is at least 4.5:1
- [ ] Large text contrast ratio is at least 3:1
- [ ] UI components have 3:1 contrast ratio
- [ ] Text can be resized to 200% without loss of functionality
- [ ] Keyboard focus is visible
- [ ] Functionality is available via keyboard
- [ ] Users have enough time to read and use content
- [ ] Moving content can be paused, stopped, or hidden
- [ ] Navigation is consistent across pages

### Implementation Checklist
```html
<!-- Example of WCAG AA compliant component -->
<div class="form-group">
    <label for="email" class="form-label">
        Email Address
        <span class="required" aria-label="required">*</span>
    </label>
    <input
        type="email"
        id="email"
        name="email"
        class="form-input"
        aria-describedby="email-help email-error"
        aria-required="true"
        aria-invalid="false"
    >
    <div id="email-help" class="form-help">
        We'll never share your email with anyone else.
    </div>
    <div id="email-error" class="form-error hidden" role="alert">
        Please enter a valid email address
    </div>
</div>
```

---

## Keyboard Navigation

### Tab Order Management
```html
<!-- Logical tab order -->
<header>
    <nav>
        <a href="/home" tabindex="0">Home</a>
        <a href="/about" tabindex="0">About</a>
        <a href="/contact" tabindex="0">Contact</a>
    </nav>
</header>

<main>
    <!-- Main content -->
</main>

<footer>
    <a href="/privacy" tabindex="0">Privacy</a>
    <a href="/terms" tabindex="0">Terms</a>
</footer>
```

### Skip Links
```html
<!-- Skip to main content -->
<a href="#main-content" class="skip-link">
    Skip to main content
</a>

<!-- Skip to navigation -->
<a href="#main-navigation" class="skip-link">
    Skip to navigation
</a>

<!-- CSS for skip links -->
<style>
.skip-link {
    position: absolute;
    top: -40px;
    left: 6px;
    background: var(--primary-500);
    color: white;
    padding: 8px;
    text-decoration: none;
    border-radius: 4px;
    z-index: 1000;
}

.skip-link:focus {
    top: 6px;
}
</style>
```

### Keyboard Event Handling
```javascript
// Keyboard navigation patterns
class KeyboardNavigation {
    constructor() {
        this.init();
    }

    init() {
        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCurrentModal();
                this.closeMobileMenu();
            }
        });

        // Arrow key navigation for menus
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                this.handleMenuNavigation(e);
            }
        });

        // Tab trapping for modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && this.isModalOpen()) {
                this.trapFocus(e);
            }
        });
    }

    handleMenuNavigation(e) {
        const menuItem = e.target.closest('[role="menuitem"]');
        if (menuItem) {
            e.preventDefault();
            const menuItems = Array.from(menuItem.parentElement.querySelectorAll('[role="menuitem"]'));
            const currentIndex = menuItems.indexOf(menuItem);
            const direction = e.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = (currentIndex + direction + menuItems.length) % menuItems.length;
            menuItems[nextIndex].focus();
        }
    }

    trapFocus(e) {
        const modal = document.querySelector('.modal[aria-hidden="false"]');
        if (modal) {
            const focusableElements = modal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    }
}
```

### Focus Visible States
```css
/* Custom focus styles */
.focus-visible {
    outline: 2px solid var(--primary-500);
    outline-offset: 2px;
    border-radius: 4px;
}

/* High contrast focus */
@media (prefers-contrast: high) {
    .focus-visible {
        outline: 3px solid;
        outline-color: Highlight;
        outline-offset: 2px;
    }
}

/* Skip focus styles */
button:focus:not(:focus-visible) {
    outline: none;
}

button:focus-visible {
    outline: 2px solid var(--primary-500);
    outline-offset: 2px;
}

/* Focus indicators for interactive elements */
.btn:focus-visible,
.form-input:focus-visible,
.form-select:focus-visible,
.form-textarea:focus-visible {
    outline: 2px solid var(--primary-500);
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}
```

---

## Screen Reader Support

### Semantic HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Title - Site Name</title>
</head>
<body>
    <!-- Header with navigation landmark -->
    <header role="banner">
        <nav role="navigation" aria-label="Main navigation">
            <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/about">About</a></li>
            </ul>
        </nav>
    </header>

    <!-- Main content landmark -->
    <main id="main-content" role="main" aria-labelledby="page-title">
        <h1 id="page-title">Page Title</h1>
        <section aria-labelledby="section-title">
            <h2 id="section-title">Section Title</h2>
            <!-- Content -->
        </section>
    </main>

    <!-- Complementary content -->
    <aside role="complementary" aria-labelledby="sidebar-title">
        <h2 id="sidebar-title">Related Information</h2>
        <!-- Sidebar content -->
    </aside>

    <!-- Footer landmark -->
    <footer role="contentinfo">
        <p>&copy; 2024 Site Name</p>
    </footer>
</body>
</html>
```

### Screen Reader Announcements
```javascript
// Live regions for dynamic content
class ScreenReaderAnnouncer {
    constructor() {
        this.createAnnouncer();
    }

    createAnnouncer() {
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';
        announcer.id = 'sr-announcer';
        document.body.appendChild(announcer);
    }

    announce(message, priority = 'polite') {
        const announcer = document.getElementById('sr-announcer');
        if (announcer) {
            announcer.setAttribute('aria-live', priority);
            announcer.textContent = message;

            // Clear after announcement
            setTimeout(() => {
                announcer.textContent = '';
            }, 1000);
        }
    }

    announceFormError(fieldName, error) {
        this.announce(`Error in ${fieldName}: ${error}`, 'assertive');
    }

    announceSuccess(message) {
        this.announce(`Success: ${message}`, 'polite');
    }

    announcePageChange(pageTitle) {
        this.announce(`Navigated to ${pageTitle}`, 'polite');
    }
}
```

### Alternative Text for Images
```html
<!-- Informative images -->
<img src="/dashboard-chart.png" alt="Sales chart showing 25% increase in Q3">

<!-- Decorative images -->
<img src="/background-pattern.png" alt="" role="presentation">

<!-- Complex images with long descriptions -->
<img src="/complex-diagram.png" alt="System architecture diagram">
<div class="sr-only" id="diagram-desc">
    Detailed description of the complex diagram...
</div>
<img src="/complex-diagram.png" alt="System architecture diagram" aria-describedby="diagram-desc">

<!-- Functional images -->
<button type="button">
    <img src="/close-icon.png" alt="Close dialog">
</button>

<!-- Images with text -->
<img src="/logo-text.png" alt="Company Name" aria-label="Company Name">
```

---

## Color and Contrast

### Contrast Requirements
```css
/* Text contrast - WCAG AA requires 4.5:1 for normal text */
.text-primary {
    color: #1f2937; /* Against white background: 15.8:1 */
}

.text-secondary {
    color: #6b7280; /* Against white background: 7.2:1 */
}

/* Large text contrast - WCAG AA requires 3:1 for large text (18pt+) */
.text-large {
    font-size: 1.125rem; /* 18px */
    color: #6b7280; /* Against white background: 7.2:1 */
}

/* Dark theme contrast */
.dark .text-primary {
    color: #f9fafb; /* Against dark background: 15.8:1 */
}

.dark .text-secondary {
    color: #d1d5db; /* Against dark background: 12.6:1 */
}
```

### Focus Indicators
```css
/* High contrast focus indicators */
.focus-indicator {
    position: relative;
}

.focus-indicator:focus::after {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border: 2px solid var(--focus-color, #2563eb);
    border-radius: 4px;
    pointer-events: none;
}

/* Double border for better visibility */
.btn:focus {
    outline: 2px solid var(--primary-500);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.2);
}
```

### Color-Independent Design
```html
<!-- Don't rely on color alone -->
<div class="status-indicator">
    <span class="status-icon" aria-label="Status: Active">
        <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
        </svg>
    </span>
    <span class="status-text">Active</span>
</div>

<!-- Error states with icons and text -->
<div class="form-group">
    <label for="password" class="form-label">Password</label>
    <input
        type="password"
        id="password"
        class="form-input border-red-500"
        aria-invalid="true"
        aria-describedby="password-error"
    >
    <div id="password-error" class="form-error" role="alert">
        <svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
        </svg>
        Password must be at least 8 characters
    </div>
</div>
```

---

## Focus Management

### Modal Focus Management
```javascript
class ModalFocusManager {
    constructor() {
        this.previousFocus = null;
        this.init();
    }

    init() {
        // Store focus when modal opens
        document.addEventListener('modal:open', (e) => {
            this.trapFocus(e.detail.modal);
        });

        // Restore focus when modal closes
        document.addEventListener('modal:close', () => {
            this.restoreFocus();
        });
    }

    trapFocus(modal) {
        // Store current focus
        this.previousFocus = document.activeElement;

        // Focus first focusable element
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }

        // Trap focus within modal
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.handleTabKey(e, focusableElements);
            }
        });
    }

    handleTabKey(e, focusableElements) {
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    restoreFocus() {
        if (this.previousFocus) {
            this.previousFocus.focus();
            this.previousFocus = null;
        }
    }
}
```

### Skip Navigation Implementation
```html
<!-- Skip links at the top of the page -->
<div class="skip-links">
    <a href="#main-navigation" class="skip-link">Skip to navigation</a>
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <a href="#footer" class="skip-link">Skip to footer</a>
</div>

<!-- CSS for skip links -->
<style>
.skip-links {
    position: absolute;
    top: -100px;
    left: 0;
    z-index: 1000;
}

.skip-link {
    position: absolute;
    top: 0;
    left: 0;
    background: var(--primary-500);
    color: white;
    padding: 8px 16px;
    text-decoration: none;
    border-radius: 0 0 4px 0;
    font-weight: 500;
    transform: translateY(-100%);
    transition: transform 0.3s ease;
}

.skip-link:focus {
    transform: translateY(0);
}
</style>
```

---

## ARIA Implementation

### Landmark Roles
```html
<!-- Page structure with landmarks -->
<div role="application" aria-label="Mikrotik Billing System">
    <header role="banner">
        <nav role="navigation" aria-label="Main navigation">
            <ul role="menubar">
                <li role="none">
                    <a href="/dashboard" role="menuitem">Dashboard</a>
                </li>
                <li role="none">
                    <a href="/customers" role="menuitem">Customers</a>
                </li>
            </ul>
        </nav>
    </header>

    <main role="main" aria-labelledby="page-title">
        <h1 id="page-title">Dashboard</h1>

        <section aria-labelledby="stats-title">
            <h2 id="stats-title">Statistics</h2>
            <!-- Stats content -->
        </section>

        <section aria-labelledby="recent-activity-title">
            <h2 id="recent-activity-title">Recent Activity</h2>
            <!-- Activity content -->
        </section>
    </main>

    <aside role="complementary" aria-labelledby="sidebar-title">
        <h2 id="sidebar-title">Quick Actions</h2>
        <!-- Sidebar content -->
    </aside>

    <footer role="contentinfo">
        <p>&copy; 2024 Mikrotik Billing System</p>
    </footer>
</div>
```

### Dynamic Content ARIA
```html
<!-- Live regions for dynamic updates -->
<div aria-live="polite" aria-atomic="true" class="sr-only" id="status-announcer"></div>

<!-- Loading states -->
<div class="loading-container" aria-busy="true" aria-label="Loading customer data">
    <div class="loading-spinner" aria-hidden="true"></div>
    <p>Loading...</p>
</div>

<!-- Expandable content -->
<button
    aria-expanded="false"
    aria-controls="customer-details"
    onclick="toggleCustomerDetails()"
>
    View Customer Details
</button>

<div id="customer-details" class="hidden" aria-hidden="true">
    <!-- Customer details content -->
</div>

<!-- Tab system -->
<div role="tablist" aria-label="Customer management">
    <button
        role="tab"
        aria-selected="true"
        aria-controls="all-customers"
        id="all-customers-tab"
        onclick="switchTab('all-customers')"
    >
        All Customers
    </button>
    <button
        role="tab"
        aria-selected="false"
        aria-controls="active-customers"
        id="active-customers-tab"
        onclick="switchTab('active-customers')"
    >
        Active Customers
    </button>
</div>

<div
    role="tabpanel"
    id="all-customers"
    aria-labelledby="all-customers-tab"
    tabindex="0"
>
    <!-- All customers content -->
</div>

<div
    role="tabpanel"
    id="active-customers"
    aria-labelledby="active-customers-tab"
    tabindex="0"
    hidden
>
    <!-- Active customers content -->
</div>
```

### Form ARIA Attributes
```html
<form aria-labelledby="form-title">
    <h2 id="form-title">Add New Customer</h2>

    <div class="form-group">
        <label for="customer-name" class="form-label">
            Customer Name
            <span class="required" aria-label="required">*</span>
        </label>
        <input
            type="text"
            id="customer-name"
            name="customer-name"
            class="form-input"
            aria-required="true"
            aria-describedby="name-help name-error"
            aria-invalid="false"
        >
        <div id="name-help" class="form-help">
            Enter the full name of the customer
        </div>
        <div id="name-error" class="form-error hidden" role="alert">
            Please enter a valid name
        </div>
    </div>

    <!-- Required field indicator -->
    <div class="form-legend" aria-label="Required fields">
        <span class="required" aria-label="required">*</span> Required fields
    </div>

    <div class="form-actions">
        <button type="submit" class="btn btn-primary">
            Create Customer
        </button>
        <button type="button" class="btn btn-secondary" onclick="cancelForm()">
            Cancel
        </button>
    </div>
</form>
```

---

## Forms Accessibility

### Accessible Form Structure
```html
<form novalidate aria-labelledby="form-title">
    <fieldset>
        <legend>Customer Information</legend>

        <div class="form-group">
            <label for="firstName" class="form-label">
                First Name
                <span class="required" aria-label="required">*</span>
            </label>
            <input
                type="text"
                id="firstName"
                name="firstName"
                class="form-input"
                required
                aria-required="true"
                aria-describedby="firstName-help"
                autocomplete="given-name"
            >
            <div id="firstName-help" class="form-help">
                Enter your first name as it appears on official documents
            </div>
        </div>

        <div class="form-group">
            <label for="email" class="form-label">
                Email Address
                <span class="required" aria-label="required">*</span>
            </label>
            <input
                type="email"
                id="email"
                name="email"
                class="form-input"
                required
                aria-required="true"
                aria-describedby="email-help email-error"
                aria-invalid="false"
                autocomplete="email"
            >
            <div id="email-help" class="form-help">
                We'll use this to send account notifications
            </div>
            <div id="email-error" class="form-error hidden" role="alert">
                Please enter a valid email address
            </div>
        </div>
    </fieldset>

    <fieldset>
        <legend>Notification Preferences</legend>

        <div class="form-group">
            <legend class="form-label">How would you like to receive notifications?</legend>
            <div class="space-y-2">
                <div>
                    <input
                        type="radio"
                        id="email-notifications"
                        name="notifications"
                        value="email"
                        class="sr-only"
                        aria-describedby="email-notifications-desc"
                    >
                    <label for="email-notifications" class="form-radio-label">
                        <span class="radio-indicator" aria-hidden="true"></span>
                        Email Notifications
                        <span id="email-notifications-desc" class="text-sm text-gray-600">
                            Receive updates via email
                        </span>
                    </label>
                </div>

                <div>
                    <input
                        type="radio"
                        id="sms-notifications"
                        name="notifications"
                        value="sms"
                        class="sr-only"
                        aria-describedby="sms-notifications-desc"
                    >
                    <label for="sms-notifications" class="form-radio-label">
                        <span class="radio-indicator" aria-hidden="true"></span>
                        SMS Notifications
                        <span id="sms-notifications-desc" class="text-sm text-gray-600">
                            Receive updates via SMS message
                        </span>
                    </label>
                </div>
            </div>
        </div>
    </fieldset>
</form>
```

### Form Validation Accessibility
```javascript
class AccessibleFormValidator {
    constructor(form) {
        this.form = form;
        this.init();
    }

    init() {
        this.form.addEventListener('submit', (e) => {
            this.handleSubmit(e);
        });

        // Real-time validation feedback
        this.form.addEventListener('input', (e) => {
            this.validateField(e.target);
        });

        // Clear errors on focus
        this.form.addEventListener('focus', (e) => {
            this.clearFieldError(e.target);
        }, true);
    }

    handleSubmit(e) {
        const isValid = this.validateForm();
        if (!isValid) {
            e.preventDefault();

            // Focus first error field
            const firstError = this.form.querySelector('[aria-invalid="true"]');
            if (firstError) {
                firstError.focus();
            }

            // Announce errors to screen readers
            const errorCount = this.form.querySelectorAll('[aria-invalid="true"]').length;
            this.announceErrors(errorCount);
        }
    }

    validateField(field) {
        const isValid = this.checkFieldValidity(field);
        const errorElement = document.getElementById(`${field.id}-error`);

        if (!isValid) {
            field.setAttribute('aria-invalid', 'true');
            if (errorElement) {
                errorElement.textContent = this.getErrorMessage(field);
                errorElement.classList.remove('hidden');
                errorElement.setAttribute('role', 'alert');
            }
        } else {
            this.clearFieldError(field);
        }

        return isValid;
    }

    clearFieldError(field) {
        field.setAttribute('aria-invalid', 'false');
        const errorElement = document.getElementById(`${field.id}-error`);
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.classList.add('hidden');
            errorElement.removeAttribute('role');
        }
    }

    validateForm() {
        const fields = this.form.querySelectorAll('input, select, textarea');
        let isValid = true;

        fields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    checkFieldValidity(field) {
        if (field.required && !field.value.trim()) {
            return false;
        }

        if (field.type === 'email' && field.value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(field.value);
        }

        if (field.pattern && field.value) {
            const pattern = new RegExp(field.pattern);
            return pattern.test(field.value);
        }

        return true;
    }

    getErrorMessage(field) {
        if (field.required && !field.value.trim()) {
            return `${this.getFieldLabel(field)} is required`;
        }

        if (field.type === 'email' && field.value) {
            return 'Please enter a valid email address';
        }

        if (field.pattern && field.value) {
            return 'Please enter a valid format';
        }

        return 'This field is invalid';
    }

    getFieldLabel(field) {
        const label = document.querySelector(`label[for="${field.id}"]`);
        return label ? label.textContent.replace(/\*/g, '').trim() : field.name;
    }

    announceErrors(errorCount) {
        const announcer = document.getElementById('sr-announcer');
        if (announcer) {
            announcer.textContent = `Form has ${errorCount} error${errorCount > 1 ? 's' : ''}. Please review and correct the highlighted fields.`;
        }
    }
}
```

---

## Table Accessibility

### Accessible Data Table
```html
<div class="table-container">
    <table
        role="table"
        aria-labelledby="customers-table-title"
        aria-describedby="customers-table-description"
    >
        <caption id="customers-table-description" class="sr-only">
            A list of all customers in the system with their contact information and account status.
            Use arrow keys to navigate between cells.
        </caption>

        <thead>
            <tr role="row">
                <th
                    scope="col"
                    role="columnheader"
                    aria-sort="none"
                    tabindex="0"
                    onclick="sortTable('name')"
                    onkeydown="handleSortKeydown(event, 'name')"
                >
                    Customer Name
                    <span class="sort-indicator" aria-hidden="true"></span>
                </th>
                <th
                    scope="col"
                    role="columnheader"
                    aria-sort="none"
                    tabindex="0"
                    onclick="sortTable('email')"
                    onkeydown="handleSortKeydown(event, 'email')"
                >
                    Email Address
                    <span class="sort-indicator" aria-hidden="true"></span>
                </th>
                <th
                    scope="col"
                    role="columnheader"
                >
                    Account Status
                </th>
                <th
                    scope="col"
                    role="columnheader"
                >
                    Actions
                </th>
            </tr>
        </thead>

        <tbody role="rowgroup">
            <tr role="row" tabindex="0">
                <td role="gridcell" headers="name">
                    <div class="flex items-center">
                        <img src="/avatar.jpg" alt="" class="h-8 w-8 rounded-full mr-3">
                        <span>John Doe</span>
                    </div>
                </td>
                <td role="gridcell" headers="email">
                    john.doe@example.com
                </td>
                <td role="gridcell" headers="status">
                    <span class="status-badge status-active" aria-label="Account status: Active">
                        Active
                    </span>
                </td>
                <td role="gridcell" headers="actions">
                    <div class="table-actions" role="toolbar" aria-label="Customer actions">
                        <button
                            type="button"
                            aria-label="Edit John Doe"
                            onclick="editCustomer('123')"
                        >
                            <svg class="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <!-- Edit icon -->
                            </svg>
                        </button>
                        <button
                            type="button"
                            aria-label="Delete John Doe"
                            onclick="deleteCustomer('123')"
                        >
                            <svg class="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <!-- Delete icon -->
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        </tbody>
    </table>
</div>
```

### Table Navigation JavaScript
```javascript
class AccessibleTable {
    constructor(table) {
        this.table = table;
        this.currentCell = null;
        this.init();
    }

    init() {
        this.table.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });

        this.table.addEventListener('click', (e) => {
            this.handleCellClick(e);
        });
    }

    handleKeydown(e) {
        const cell = e.target.closest('td, th');
        if (!cell) return;

        const row = cell.parentElement;
        const cells = Array.from(row.children);
        const cellIndex = cells.indexOf(cell);
        const isHeader = cell.tagName === 'TH';
        const rows = isHeader ?
            [this.table.querySelector('thead tr')] :
            Array.from(this.table.querySelectorAll('tbody tr'));
        const rowIndex = rows.indexOf(row);

        let newCell = null;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                if (cellIndex < cells.length - 1) {
                    newCell = cells[cellIndex + 1];
                }
                break;

            case 'ArrowLeft':
                e.preventDefault();
                if (cellIndex > 0) {
                    newCell = cells[cellIndex - 1];
                }
                break;

            case 'ArrowDown':
                e.preventDefault();
                if (!isHeader && rowIndex < rows.length - 1) {
                    newCell = rows[rowIndex + 1].children[cellIndex];
                }
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (!isHeader && rowIndex > 0) {
                    newCell = rows[rowIndex - 1].children[cellIndex];
                }
                break;

            case 'Home':
                e.preventDefault();
                newCell = isHeader ? cells[0] : rows[rowIndex].children[0];
                break;

            case 'End':
                e.preventDefault();
                newCell = isHeader ?
                    cells[cells.length - 1] :
                    rows[rowIndex].children[cells.length - 1];
                break;

            case 'PageDown':
                e.preventDefault();
                if (!isHeader) {
                    newCell = rows[rows.length - 1].children[cellIndex];
                }
                break;

            case 'PageUp':
                e.preventDefault();
                if (!isHeader) {
                    newCell = rows[0].children[cellIndex];
                }
                break;

            case 'Enter':
            case ' ':
                e.preventDefault();
                this.activateCell(cell);
                return;
        }

        if (newCell) {
            newCell.focus();
            this.announceCellContent(newCell);
        }
    }

    handleCellClick(e) {
        const cell = e.target.closest('td, th');
        if (cell) {
            cell.focus();
        }
    }

    activateCell(cell) {
        // Handle sortable headers
        if (cell.tagName === 'TH' && cell.onclick) {
            cell.click();
            return;
        }

        // Handle actionable cells
        const actionButton = cell.querySelector('button');
        if (actionButton) {
            actionButton.click();
        }
    }

    announceCellContent(cell) {
        const announcer = document.getElementById('sr-announcer');
        if (announcer) {
            let content = cell.textContent.trim();

            // Add context for headers
            if (cell.tagName === 'TH') {
                content = `Column header: ${content}, ${cell.getAttribute('aria-sort') || 'unsorted'}`;
            }

            // Add position information
            const row = cell.parentElement;
            const rows = cell.tagName === 'TH' ?
                [row] :
                Array.from(this.table.querySelectorAll('tbody tr'));
            const rowIndex = rows.indexOf(row) + 1;
            const cellIndex = Array.from(row.children).indexOf(cell) + 1;

            content += `, Row ${rowIndex}, Column ${cellIndex}`;

            announcer.textContent = content;
        }
    }
}
```

---

## Mobile Accessibility

### Touch Accessibility
```html
<!-- Large touch targets (minimum 44x44px) -->
<button class="btn btn-primary min-h-[44px] min-w-[44px] p-4">
    <svg class="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <!-- Icon -->
    </svg>
    <span class="sr-only">Add Customer</span>
</button>

<!-- Accessible touch gestures -->
<div
    class="swipe-container"
    role="region"
    aria-label="Swipeable customer list"
    tabindex="0"
    aria-describedby="swipe-instructions"
>
    <div id="swipe-instructions" class="sr-only">
        Use swipe gestures to navigate between customers, or use arrow keys
    </div>
    <!-- Swipeable content -->
</div>
```

### Mobile VoiceOver/TalkBack Support
```html
<!-- Mobile navigation with proper roles -->
<nav role="navigation" aria-label="Mobile navigation">
    <div class="mobile-nav-grid">
        <a
            href="/dashboard"
            class="mobile-nav-item"
            role="button"
            aria-label="Dashboard, current page"
            aria-current="page"
        >
            <svg class="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <!-- Dashboard icon -->
            </svg>
            <span>Dashboard</span>
        </a>

        <a
            href="/customers"
            class="mobile-nav-item"
            role="button"
            aria-label="Customers"
        >
            <svg class="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <!-- Customers icon -->
            </svg>
            <span>Customers</span>
        </a>
    </div>
</nav>
```

### Mobile Form Accessibility
```html
<!-- Mobile-optimized form inputs -->
<div class="form-group">
    <label for="mobile-number" class="form-label">
        Mobile Number
        <span class="required" aria-label="required">*</span>
    </label>
    <input
        type="tel"
        id="mobile-number"
        name="mobile-number"
        class="form-input text-lg p-4 min-h-[44px]"
        aria-required="true"
        aria-describedby="mobile-help"
        inputmode="tel"
        pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
        autocomplete="tel"
    >
    <div id="mobile-help" class="form-help">
        Enter your 10-digit mobile number
    </div>
</div>

<!-- Mobile select with native behavior -->
<div class="form-group">
    <label for="account-type" class="form-label">Account Type</label>
    <select
        id="account-type"
        name="account-type"
        class="form-select text-lg p-4 min-h-[44px]"
        aria-describedby="account-type-help"
    >
        <option value="">Select account type</option>
        <option value="individual">Individual</option>
        <option value="business">Business</option>
    </select>
    <div id="account-type-help" class="form-help">
        Choose the type of account you want to create
    </div>
</div>
```

---

## Testing Guidelines

### Automated Testing
```javascript
// Accessibility testing with axe-core
import axe from 'axe-core';

class AccessibilityTester {
    async runTests() {
        const results = await axe.run(document.body, {
            rules: {
                // Enable WCAG 2.1 AA rules
                'color-contrast': { enabled: true },
                'keyboard-navigation': { enabled: true },
                'aria-labels': { enabled: true },
                'focus-management': { enabled: true },
                'form-labels': { enabled: true },
                'table-headers': { enabled: true },
                'link-in-text-block': { enabled: true },
                'link-name': { enabled: true },
                'list': { enabled: true },
                'listitem': { enabled: true },
                'duplicate-id': { enabled: true },
                'html-has-lang': { enabled: true },
                'page-title': { enabled: true },
                'skip-link': { enabled: true }
            }
        });

        this.reportResults(results);
    }

    reportResults(results) {
        if (results.violations.length === 0) {
            console.log('✅ No accessibility violations found');
            return;
        }

        console.group('🚨 Accessibility Violations');
        results.violations.forEach(violation => {
            console.error(`${violation.id}: ${violation.description}`);
            console.error('Impact:', violation.impact);
            console.error('Elements:', violation.nodes.length);
            violation.nodes.forEach(node => {
                console.error('  -', node.target);
                console.error('    ', node.failureSummary);
            });
        });
        console.groupEnd();
    }
}
```

### Manual Testing Checklist
```markdown
## Keyboard Navigation Testing
- [ ] Can access all interactive elements with Tab key
- [ ] Tab order follows logical reading order
- [ ] Focus indicators are clearly visible
- [ ] Can activate all buttons, links, and controls with Enter/Space
- [ ] Can navigate within forms using Tab and Shift+Tab
- [ ] Can operate all controls without a mouse
- [ ] Escape key closes modals and dropdowns
- [ ] Arrow keys work for custom components (tabs, menus)

## Screen Reader Testing
- [ ] All images have appropriate alt text
- [ ] Form fields have proper labels
- [ ] Page structure uses semantic HTML
- [ ] Dynamic content changes are announced
- [ ] Error messages are accessible
- [ ] Links make sense out of context
- [ ] Tables have proper headers and captions
- [ ] Custom widgets have proper ARIA attributes

## Visual Accessibility Testing
- [ ] Text meets contrast ratios (4.5:1 normal, 3:1 large)
- [ ] Focus indicators have sufficient contrast
- [ ] Information isn't conveyed by color alone
- [ ] Text can be resized to 200% without breaking layout
- [ ] Content is usable in high contrast mode
- [ ] Content respects prefers-reduced-motion

## Mobile Accessibility Testing
- [ ] Touch targets are at least 44x44px
- [ ] Sufficient spacing between touch targets
- [ ] VoiceOver/TalkBack navigation works correctly
- [ ] Zoom and pinch-to-zoom work properly
- [ ] Landscape orientation doesn't break functionality
- [ ] Device rotation maintains context
```

### User Testing Scenarios
```javascript
// Accessibility user testing scenarios
const accessibilityTests = [
    {
        name: 'Screen Reader Navigation',
        description: 'Navigate entire application using only screen reader',
        successCriteria: [
            'Can understand page structure and purpose',
            'Can navigate to all interactive elements',
            'Can complete forms without visual assistance',
            'Dynamic content changes are announced appropriately'
        ]
    },
    {
        name: 'Keyboard Only Navigation',
        description: 'Complete all major tasks using only keyboard',
        successCriteria: [
            'Can access all features without mouse',
            'Focus management is logical and predictable',
            'Can understand current location and context',
            'Can efficiently complete common workflows'
        ]
    },
    {
        name: 'Low Vision Experience',
        description: 'Use application with 200% zoom and high contrast',
        successCriteria: [
            'Layout remains usable at 200% zoom',
            'Content is readable in high contrast mode',
            'No information is lost due to color choices',
            'Can successfully complete all tasks'
        ]
    },
    {
        name: 'Mobile Voice Control',
        description: 'Navigate mobile app using voice commands',
        successCriteria: [
            'Voice control commands work reliably',
            'Can navigate between screens',
            'Can interact with form elements',
            'Can complete critical workflows'
        ]
    }
];
```

### Browser Testing Matrix
| Browser | Screen Reader | Keyboard | High Contrast | Zoom | Touch |
|---------|---------------|----------|---------------|------|-------|
| Chrome | ChromeVox | ✅ | ✅ | ✅ | ✅ |
| Firefox | NVDA | ✅ | ✅ | ✅ | ✅ |
| Safari | VoiceOver | ✅ | ✅ | ✅ | ✅ |
| Edge | Narrator | ✅ | ✅ | ✅ | ✅ |

This accessibility guide ensures the Mikrotik Billing System meets WCAG 2.1 AA standards and provides an inclusive experience for all users.