// MCP Playwright Configuration for Mikrotik Billing System Testing
// This configuration is designed for MCP Playwright integration, not standard Playwright

module.exports = {
  // MCP Playwright Settings
  mcpPlaywright: {
    // Server configuration for MCP integration
    server: {
      name: 'mikrotik-billing-test-server',
      version: '1.0.0',
      description: 'MCP Playwright server for automated web application testing'
    },

    // Test orchestration settings
    orchestration: {
      maxConcurrentSessions: 3,
      defaultTimeout: 30000,
      navigationTimeout: 10000,
      elementTimeout: 5000,
      retryAttempts: 3,
      screenshotOnFailure: true,
      videoOnFailure: false
    },

    // Browser configuration for MCP agents
    browsers: {
      chromium: {
        name: 'chromium',
        headless: true,
        viewport: { width: 1920, height: 1080 },
        userAgent: 'MCP-Test-Agent/1.0.0'
      },
      firefox: {
        name: 'firefox',
        headless: true,
        viewport: { width: 1920, height: 1080 },
        userAgent: 'MCP-Test-Agent/1.0.0'
      },
      webkit: {
        name: 'webkit',
        headless: true,
        viewport: { width: 1920, height: 1080 },
        userAgent: 'MCP-Test-Agent/1.0.0'
      }
    },

    // Viewport configurations for responsive testing
    viewports: {
      desktop: { width: 1920, height: 1080 },
      laptop: { width: 1366, height: 768 },
      tablet: { width: 768, height: 1024 },
      mobile: { width: 375, height: 667 },
      'mobile-small': { width: 320, height: 568 }
    },

    // Test target configuration
    target: {
      baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
      testUserRoles: ['super_admin', 'admin', 'operator'],
      testCredentials: {
        super_admin: {
          username: process.env.TEST_SUPER_ADMIN_USERNAME || 'admin',
          password: process.env.TEST_SUPER_ADMIN_PASSWORD || 'admin123'
        },
        admin: {
          username: process.env.TEST_ADMIN_USERNAME || 'test_admin',
          password: process.env.TEST_ADMIN_PASSWORD || 'test123'
        },
        operator: {
          username: process.env.TEST_OPERATOR_USERNAME || 'test_operator',
          password: process.env.TEST_OPERATOR_PASSWORD || 'test123'
        }
      }
    },

    // MCP Agent capabilities
    agentCapabilities: {
      navigation: {
        canClickElements: true,
        canFillForms: true,
        canScrollPages: true,
        canTakeScreenshots: true,
        canExecuteJavaScript: true
      },
      analysis: {
        canDetectErrors: true,
        canAnalyzeLayout: true,
        canValidateAccessibility: true,
        canMeasurePerformance: true,
        canIdentifyMissingPages: true
      },
      reporting: {
        canGenerateBugReports: true,
        canCreateTaskLists: true,
        canExportResults: true,
        canProvideRecommendations: true
      }
    },

    // Testing scenarios for MCP agents
    scenarios: {
      fullRegression: {
        description: 'Complete application testing across all roles and devices',
        includeNavigation: true,
        includeForms: true,
        includeResponsive: true,
        includeRoles: true,
        includePerformance: true,
        includeAccessibility: true,
        maxDuration: 1800000 // 30 minutes
      },
      smokeTest: {
        description: 'Basic functionality validation',
        includeNavigation: true,
        includeForms: false,
        includeResponsive: false,
        includeRoles: true,
        includePerformance: false,
        includeAccessibility: false,
        maxDuration: 300000 // 5 minutes
      },
      navigationOnly: {
        description: 'Navigation structure and page access testing',
        includeNavigation: true,
        includeForms: false,
        includeResponsive: false,
        includeRoles: true,
        includePerformance: false,
        includeAccessibility: false,
        maxDuration: 600000 // 10 minutes
      }
    },

    // Error detection settings for MCP agents
    errorDetection: {
      consoleErrors: [
        'JavaScript Error',
        'Uncaught Exception',
        'Network Error',
        'Resource Load Error'
      ],
      pageErrors: [
        '404 Not Found',
        '500 Internal Server Error',
        '403 Forbidden',
        '401 Unauthorized'
      ],
      visualErrors: [
        'broken_images',
        'layout_shifts',
        'missing_elements',
        'overlapping_elements',
        'inaccessible_elements'
      ],
      performanceThresholds: {
        maxPageLoadTime: 3000,
        maxResourceLoadTime: 1000,
        maxMemoryUsage: 512 * 1024 * 1024,
        maxCpuUsage: 80
      }
    },

    // Reporting configuration
    reporting: {
      formats: ['json', 'html', 'markdown'],
      includeScreenshots: true,
      includeVideos: false,
      includeTraces: true,
      outputDirectory: process.env.REPORTS_DIRECTORY || './test-reports',
      retentionDays: parseInt(process.env.KEEP_REPORTS_DAYS) || 30
    },

    // Mikrotik integration testing
    mikrotikTesting: {
      enabled: true,
      host: process.env.TEST_MIKROTIK_HOST || '192.168.88.1',
      port: parseInt(process.env.TEST_MIKROTIK_PORT) || 8728,
      username: process.env.TEST_MIKROTIK_USERNAME || 'test_admin',
      password: process.env.TEST_MIKROTIK_PASSWORD || 'test_password',
      timeout: 10000,
      testScenarios: [
        'api_connectivity',
        'user_sync',
        'profile_management',
        'real_time_monitoring'
      ]
    },

    // Integration with existing system
    integration: {
      database: {
        path: process.env.TEST_DATABASE_PATH || './test_database.sqlite',
        backupEnabled: true,
        cleanupAfterTests: true
      },
      authentication: {
        jwtSecret: process.env.JWT_SECRET || 'test-secret-key',
        sessionDuration: 86400000, // 24 hours for testing
        autoLogin: true
      },
      notifications: {
        testWhatsApp: false, // Disable WhatsApp in testing to avoid spam
        logNotifications: true
      }
    },

    // Performance monitoring
    performance: {
      enabled: true,
      metrics: [
        'page_load_time',
        'time_to_interactive',
        'first_contentful_paint',
        'largest_contentful_paint',
        'cumulative_layout_shift',
        'first_input_delay'
      ],
      thresholds: {
        page_load_time: 3000,
        time_to_interactive: 5000,
        first_contentful_paint: 2000,
        largest_contentful_paint: 2500,
        cumulative_layout_shift: 0.1,
        first_input_delay: 100
      }
    },

    // Accessibility testing
    accessibility: {
      enabled: true,
      standards: ['WCAG 2.1 AA'],
      automatedChecks: [
        'color_contrast',
        'keyboard_navigation',
        'screen_reader_support',
        'focus_management',
        'aria_labels'
      ],
      minimumScore: 80
    },

    // Environment-specific settings
    environment: {
      test: {
        headless: true,
        screenshotOnFailure: true,
        videoOnFailure: false,
        traceOnFailure: true,
        retryAttempts: 2
      },
      development: {
        headless: false,
        screenshotOnFailure: true,
        videoOnFailure: true,
        traceOnFailure: true,
        retryAttempts: 1
      },
      ci: {
        headless: true,
        screenshotOnFailure: true,
        videoOnFailure: false,
        traceOnFailure: false,
        retryAttempts: 3
      }
    }
  },

  // Helper functions for MCP agents
  helpers: {
    // Get browser configuration by name
    getBrowserConfig(browserName) {
      return this.mcpPlaywright.browsers[browserName] || this.mcpPlaywright.browsers.chromium;
    },

    // Get viewport configuration by name
    getViewport(viewportName) {
      return this.mcpPlaywright.viewports[viewportName] || this.mcpPlaywright.viewports.desktop;
    },

    // Get scenario configuration by name
    getScenario(scenarioName) {
      return this.mcpPlaywright.scenarios[scenarioName] || this.mcpPlaywright.scenarios.smokeTest;
    },

    // Get user credentials for role
    getCredentials(role) {
      return this.mcpPlaywright.target.testCredentials[role];
    },

    // Format duration for reporting
    formatDuration(milliseconds) {
      const seconds = Math.floor(milliseconds / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      } else {
        return `${seconds}s`;
      }
    },

    // Validate MCP configuration
    validate() {
      const errors = [];

      // Validate required directories
      const reportsDir = this.mcpPlaywright.reporting.outputDirectory;
      if (!require('fs').existsSync(reportsDir)) {
        try {
          require('fs').mkdirSync(reportsDir, { recursive: true });
        } catch (error) {
          errors.push(`Failed to create reports directory: ${error.message}`);
        }
      }

      // Validate browser configuration
      if (!this.mcpPlaywright.browsers || Object.keys(this.mcpPlaywright.browsers).length === 0) {
        errors.push('At least one browser must be configured');
      }

      return {
        valid: errors.length === 0,
        errors: errors
      };
    }
  }
};