const { EventEmitter } = require('events');
const path = require('path');

/**
 * Comprehensive Testing Framework
 * Provides unified testing infrastructure for unit, integration, E2E,
 * performance, and API testing with comprehensive reporting
 */
class ComprehensiveTestingFramework extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Framework settings
      frameworkId: config.frameworkId || 'mikrotik-billing-test-framework',
      version: config.version || '1.0.0',
      environment: config.environment || 'test',

      // Test types
      enableUnitTests: config.enableUnitTests !== false,
      enableIntegrationTests: config.enableIntegrationTests !== false,
      enableE2ETests: config.enableE2ETests !== false,
      enablePerformanceTests: config.enablePerformanceTests !== false,
      enableAPITests: config.enableAPITests !== false,

      // Test discovery
      testDirs: config.testDirs || {
        unit: 'src/test/unit',
        integration: 'src/test/integration',
        e2e: 'src/test/e2e',
        performance: 'src/test/performance',
        api: 'src/test/api'
      },
      testPattern: config.testPattern || '**/*.test.js',
      excludePattern: config.excludePattern || '**/*.skip.test.js',

      // Execution
      parallel: config.parallel || false,
      maxConcurrency: config.maxConcurrency || 4,
      timeout: config.timeout || 30000, // 30 seconds
      retries: config.retries || 0,
      bailOnFailure: config.bailOnFailure || false,

      // Reporting
      enableReporting: config.enableReporting !== false,
      reportFormat: config.reportFormat || ['json', 'html'],
      outputDir: config.outputDir || 'test-results',
      enableCoverage: config.enableCoverage !== false,
      coverageThreshold: config.coverageThreshold || {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      },

      // Mocking
      enableMocking: config.enableMocking !== false,
      mockDir: config.mockDir || 'src/test/mocks',
      enableFixtures: config.enableFixtures !== false,
      fixtureDir: config.fixtureDir || 'src/test/fixtures',

      // CI/CD integration
      enableCI: config.enableCI || false,
      ciFormat: config.ciFormat || 'junit',

      // Performance
      enableProfiling: config.enableProfiling || false,
      enableMemoryTracking: config.enableMemoryTracking || false,
      enableLoadTesting: config.enableLoadTesting || false,

      ...config
    };

    // Test registries
    this.testSuites = new Map();
    this.testResults = new Map();
    this.coverageData = new Map();
    this.performanceData = new Map();

    // Test execution state
    this.currentRun = null;
    this.testQueue = [];
    this.runningTests = new Set();

    // Mock and fixture management
    this.mocks = new Map();
    this.fixtures = new Map();

    // Reporters
    this.reporters = new Map();

    this.setupEventHandlers();
    this.initializeReporters();
  }

  setupEventHandlers() {
    this.on('test-started', this.handleTestStarted.bind(this));
    this.on('test-completed', this.handleTestCompleted.bind(this));
    this.on('test-failed', this.handleTestFailed.bind(this));
    this.on('suite-completed', this.handleSuiteCompleted.bind(this));
    this.on('run-completed', this.handleRunCompleted.bind(this));
  }

  initializeReporters() {
    if (!this.config.enableReporting) return;

    // Initialize different reporters
    if (this.config.reportFormat.includes('json')) {
      this.reporters.set('json', new JSONReporter(this.config));
    }

    if (this.config.reportFormat.includes('html')) {
      this.reporters.set('html', new HTMLReporter(this.config));
    }

    if (this.config.enableCI && this.config.ciFormat === 'junit') {
      this.reporters.set('junit', new JUnitReporter(this.config));
    }
  }

  /**
   * Discover and register test suites
   */
  async discoverTests() {
    const testFiles = await this.findTestFiles();
    const testSuites = [];

    for (const testFile of testFiles) {
      const suite = await this.parseTestFile(testFile);
      if (suite) {
        testSuites.push(suite);
        this.testSuites.set(suite.id, suite);
      }
    }

    console.log(`🔍 Discovered ${testSuites.length} test suites`);
    return testSuites;
  }

  /**
   * Find test files in configured directories
   */
  async findTestFiles() {
    const glob = require('glob');
    const testFiles = [];

    for (const [type, dir] of Object.entries(this.config.testDirs)) {
      if (!this.config[`enable${type.charAt(0).toUpperCase() + type.slice(1)}Tests`]) {
        continue;
      }

      const pattern = path.join(dir, this.config.testPattern);
      const files = glob.sync(pattern, {
        ignore: this.config.excludePattern
      });

      testFiles.push(...files.map(file => ({
        path: file,
        type,
        name: path.basename(file, '.test.js')
      })));
    }

    return testFiles;
  }

  /**
   * Parse test file and extract test suite
   */
  async parseTestFile(testFile) {
    try {
      // This would use proper AST parsing to extract tests
      // For now, create a basic test suite
      const suite = {
        id: this.generateSuiteId(testFile.path),
        name: testFile.name,
        type: testFile.type,
        path: testFile.path,
        tests: [],
        setup: null,
        teardown: null,
        beforeAll: null,
        afterAll: null,
        timeout: this.config.timeout,
        retries: this.config.retries
      };

      // Load and parse the test file
      const testModule = require(path.resolve(testFile.path));

      // Extract tests from the module
      if (testModule.tests) {
        suite.tests = testModule.tests.map(test => ({
          id: this.generateTestId(),
          name: test.name,
          fn: test.fn,
          timeout: test.timeout || suite.timeout,
          retries: test.retries || suite.retries,
          skip: test.skip || false,
          only: test.only || false,
          metadata: test.metadata || {}
        }));
      }

      return suite;

    } catch (error) {
      console.error(`Failed to parse test file ${testFile.path}:`, error);
      return null;
    }
  }

  /**
   * Run all tests
   */
  async runTests(options = {}) {
    const runId = this.generateRunId();
    const startTime = Date.now();

    const runConfig = {
      id: runId,
      type: options.type || 'all',
      filter: options.filter || null,
      parallel: options.parallel !== undefined ? options.parallel : this.config.parallel,
      maxConcurrency: options.maxConcurrency || this.config.maxConcurrency,
      timeout: options.timeout || this.config.timeout,
      retries: options.retries || this.config.retries,
      bailOnFailure: options.bailOnFailure !== undefined ? options.bailOnFailure : this.config.bailOnFailure,
      enableCoverage: options.enableCoverage !== undefined ? options.enableCoverage : this.config.enableCoverage,
      enableProfiling: options.enableProfiling !== undefined ? options.enableProfiling : this.config.enableProfiling,
      startTime,
      status: 'running'
    };

    this.currentRun = runConfig;

    try {
      // Discover tests if not already discovered
      if (this.testSuites.size === 0) {
        await this.discoverTests();
      }

      // Filter test suites based on configuration
      const suitesToRun = this.filterTestSuites(runConfig);

      // Initialize reporters
      this.initializeRunReporters(runConfig);

      // Run the tests
      const results = await this.executeTestSuites(suitesToRun, runConfig);

      // Generate reports
      await this.generateReports(results, runConfig);

      // Update run status
      runConfig.endTime = Date.now();
      runConfig.duration = runConfig.endTime - runConfig.startTime;
      runConfig.status = 'completed';

      this.currentRun = null;
      this.emit('run-completed', runConfig, results);

      return results;

    } catch (error) {
      runConfig.endTime = Date.now();
      runConfig.duration = runConfig.endTime - runConfig.startTime;
      runConfig.status = 'failed';
      runConfig.error = error.message;

      this.currentRun = null;
      this.emit('run-failed', runConfig, error);

      throw error;
    }
  }

  /**
   * Execute test suites
   */
  async executeTestSuites(suites, config) {
    const results = {
      runId: config.id,
      suites: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      }
    };

    if (config.parallel) {
      // Run suites in parallel
      const chunks = this.chunkArray(suites, config.maxConcurrency);

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(suite => this.executeTestSuite(suite, config))
        );

        results.suites.push(...chunkResults);
        this.updateSummary(results.summary, chunkResults);

        // Check if we should bail on failure
        if (config.bailOnFailure && chunkResults.some(r => r.status === 'failed')) {
          break;
        }
      }
    } else {
      // Run suites sequentially
      for (const suite of suites) {
        const suiteResult = await this.executeTestSuite(suite, config);
        results.suites.push(suiteResult);
        this.updateSummary(results.summary, [suiteResult]);

        // Check if we should bail on failure
        if (config.bailOnFailure && suiteResult.status === 'failed') {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Execute individual test suite
   */
  async executeTestSuite(suite, config) {
    const suiteResult = {
      suiteId: suite.id,
      suiteName: suite.name,
      suiteType: suite.type,
      tests: [],
      summary: {
        total: suite.tests.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      status: 'passed',
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      error: null
    };

    try {
      this.emit('suite-started', suiteResult);

      // Run beforeAll hook
      if (suite.beforeAll) {
        await this.runHook(suite.beforeAll, 'beforeAll', suite);
      }

      // Run individual tests
      for (const test of suite.tests) {
        if (test.skip) {
          suiteResult.tests.push({
            testId: test.id,
            testName: test.name,
            status: 'skipped',
            duration: 0,
            error: null,
            retries: 0
          });
          suiteResult.summary.skipped++;
          continue;
        }

        const testResult = await this.executeTest(test, suite, config);
        suiteResult.tests.push(testResult);

        if (testResult.status === 'passed') {
          suiteResult.summary.passed++;
        } else if (testResult.status === 'failed') {
          suiteResult.summary.failed++;
          suiteResult.status = 'failed';
        }
      }

      // Run afterAll hook
      if (suite.afterAll) {
        await this.runHook(suite.afterAll, 'afterAll', suite);
      }

      suiteResult.endTime = Date.now();
      suiteResult.duration = suiteResult.endTime - suiteResult.startTime;

      this.emit('suite-completed', suiteResult);

    } catch (error) {
      suiteResult.status = 'failed';
      suiteResult.error = error.message;
      suiteResult.endTime = Date.now();
      suiteResult.duration = suiteResult.endTime - suiteResult.startTime;

      this.emit('suite-failed', suiteResult, error);
    }

    return suiteResult;
  }

  /**
   * Execute individual test
   */
  async executeTest(test, suite, config) {
    const testResult = {
      testId: test.id,
      testName: test.name,
      status: 'passed',
      duration: 0,
      error: null,
      retries: 0,
      startTime: Date.now(),
      endTime: null
    };

    this.runningTests.add(test.id);
    this.emit('test-started', testResult);

    let attempt = 0;
    const maxRetries = test.retries || config.retries;

    while (attempt <= maxRetries) {
      try {
        // Run setup hook
        if (suite.setup) {
          await this.runHook(suite.setup, 'setup', suite);
        }

        // Execute test with timeout
        const testStartTime = Date.now();
        await this.executeWithTimeout(test.fn, test.timeout || config.timeout);
        const testDuration = Date.now() - testStartTime;

        // Run teardown hook
        if (suite.teardown) {
          await this.runHook(suite.teardown, 'teardown', suite);
        }

        testResult.endTime = Date.now();
        testResult.duration = testResult.endTime - testResult.startTime;

        if (attempt > 0) {
          testResult.retries = attempt;
        }

        this.runningTests.delete(test.id);
        this.emit('test-completed', testResult);

        return testResult;

      } catch (error) {
        attempt++;

        if (attempt <= maxRetries) {
          // Retry the test
          testResult.retries = attempt;
          await this.delay(1000 * attempt); // Exponential backoff
          continue;
        }

        // Test failed after all retries
        testResult.status = 'failed';
        testResult.error = {
          message: error.message,
          stack: error.stack,
          name: error.name
        };
        testResult.endTime = Date.now();
        testResult.duration = testResult.endTime - testResult.startTime;

        this.runningTests.delete(test.id);
        this.emit('test-failed', testResult, error);

        return testResult;
      }
    }
  }

  /**
   * Execute hook (setup/teardown/beforeAll/afterAll)
   */
  async runHook(hookFn, hookName, suite) {
    try {
      await hookFn();
    } catch (error) {
      console.error(`Hook ${hookName} failed in suite ${suite.name}:`, error);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Test timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Filter test suites based on configuration
   */
  filterTestSuites(config) {
    let suites = Array.from(this.testSuites.values());

    // Filter by type
    if (config.type !== 'all') {
      suites = suites.filter(suite => suite.type === config.type);
    }

    // Filter by pattern
    if (config.filter) {
      suites = suites.filter(suite =>
        suite.name.includes(config.filter) ||
        suite.path.includes(config.filter)
      );
    }

    // Filter by 'only' tests
    const onlySuites = suites.filter(suite =>
      suite.tests.some(test => test.only)
    );

    if (onlySuites.length > 0) {
      // Only run tests marked with 'only'
      suites = onlySuites.map(suite => ({
        ...suite,
        tests: suite.tests.filter(test => test.only)
      }));
    }

    return suites;
  }

  /**
   * Update summary with suite results
   */
  updateSummary(summary, suiteResults) {
    suiteResults.forEach(suite => {
      summary.total += suite.summary.total;
      summary.passed += suite.summary.passed;
      summary.failed += suite.summary.failed;
      summary.skipped += suite.summary.skipped;
    });
  }

  /**
   * Initialize reporters for test run
   */
  async initializeRunReporters(config) {
    for (const [name, reporter] of this.reporters) {
      try {
        await reporter.initialize(config);
      } catch (error) {
        console.error(`Failed to initialize ${name} reporter:`, error);
      }
    }
  }

  /**
   * Generate reports
   */
  async generateReports(results, config) {
    if (!this.config.enableReporting) return;

    for (const [name, reporter] of this.reporters) {
      try {
        await reporter.generateReport(results, config);
      } catch (error) {
        console.error(`Failed to generate ${name} report:`, error);
      }
    }
  }

  /**
   * Run unit tests
   */
  async runUnitTests(options = {}) {
    return await this.runTests({
      ...options,
      type: 'unit'
    });
  }

  /**
   * Run integration tests
   */
  async runIntegrationTests(options = {}) {
    return await this.runTests({
      ...options,
      type: 'integration'
    });
  }

  /**
   * Run E2E tests
   */
  async runE2ETests(options = {}) {
    return await this.runTests({
      ...options,
      type: 'e2e'
    });
  }

  /**
   * Run API tests
   */
  async runAPITests(options = {}) {
    return await this.runTests({
      ...options,
      type: 'api'
    });
  }

  /**
   * Run performance tests
   */
  async runPerformanceTests(options = {}) {
    return await this.runTests({
      ...options,
      type: 'performance'
    });
  }

  /**
   * Create test mock
   */
  createMock(name, implementation) {
    const mock = {
      name,
      implementation,
      calls: [],
      enabled: true,

      fn: (...args) => {
        if (!mock.enabled) {
          throw new Error(`Mock ${name} is disabled`);
        }

        mock.calls.push({
          args,
          timestamp: Date.now()
        });

        return mock.implementation(...args);
      },

      reset: () => {
        mock.calls = [];
      },

      enable: () => {
        mock.enabled = true;
      },

      disable: () => {
        mock.enabled = false;
      },

      getCallCount: () => mock.calls.length,

      getLastCall: () => mock.calls[mock.calls.length - 1] || null,

      wasCalledWith: (...args) => {
        return mock.calls.some(call =>
          JSON.stringify(call.args) === JSON.stringify(args)
        );
      }
    };

    this.mocks.set(name, mock);
    return mock.fn;
  }

  /**
   * Load test fixture
   */
  loadFixture(name) {
    if (this.fixtures.has(name)) {
      return this.fixtures.get(name);
    }

    // Load fixture from file
    const fixturePath = path.join(this.config.fixtureDir, `${name}.json`);
    try {
      const fixture = require(fixturePath);
      this.fixtures.set(name, fixture);
      return fixture;
    } catch (error) {
      throw new Error(`Failed to load fixture ${name}: ${error.message}`);
    }
  }

  /**
   * Get test results
   */
  getResults(runId = null) {
    if (runId) {
      return this.testResults.get(runId);
    }
    return Array.from(this.testResults.values());
  }

  /**
   * Get current test run status
   */
  getCurrentRunStatus() {
    return this.currentRun ? {
      ...this.currentRun,
      runningTests: Array.from(this.runningTests),
      queuedTests: this.testQueue.length
    } : null;
  }

  /**
   * Get test statistics
   */
  getStatistics() {
    const allResults = this.getResults();

    if (allResults.length === 0) {
      return {
        totalRuns: 0,
        totalTests: 0,
        totalPasses: 0,
        totalFailures: 0,
        totalSkips: 0,
        averageDuration: 0,
        successRate: 0
      };
    }

    const stats = {
      totalRuns: allResults.length,
      totalTests: 0,
      totalPasses: 0,
      totalFailures: 0,
      totalSkips: 0,
      totalDuration: 0,
      averageDuration: 0,
      successRate: 0
    };

    allResults.forEach(result => {
      stats.totalTests += result.summary.total;
      stats.totalPasses += result.summary.passed;
      stats.totalFailures += result.summary.failed;
      stats.totalSkips += result.summary.skipped;
      stats.totalDuration += result.duration;
    });

    stats.averageDuration = stats.totalDuration / stats.totalRuns;
    stats.successRate = stats.totalTests > 0 ? (stats.totalPasses / stats.totalTests) * 100 : 0;

    return stats;
  }

  // Utility methods
  generateRunId() {
    return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateSuiteId(filePath) {
    return `suite_${path.basename(filePath, '.js')}_${Date.now()}`;
  }

  generateTestId() {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Event handlers
  handleTestStarted(testResult) {
    console.log(`🧪 Starting test: ${testResult.testName}`);
  }

  handleTestCompleted(testResult) {
    const status = testResult.status === 'passed' ? '✅' : '❌';
    const retries = testResult.retries > 0 ? ` (${testResult.retries} retries)` : '';
    console.log(`${status} ${testResult.testName} - ${testResult.duration}ms${retries}`);
  }

  handleTestFailed(testResult, error) {
    console.error(`❌ Test failed: ${testResult.testName} - ${error.message}`);
  }

  handleSuiteCompleted(suiteResult) {
    const status = suiteResult.status === 'passed' ? '✅' : '❌';
    console.log(`${status} Suite: ${suiteResult.suiteName} (${suiteResult.summary.passed}/${suiteResult.summary.total} passed) - ${suiteResult.duration}ms`);
  }

  handleRunCompleted(runConfig, results) {
    console.log(`\n🎯 Test Run Completed (${runConfig.id})`);
    console.log(`   Total: ${results.summary.total}`);
    console.log(`   Passed: ${results.summary.passed}`);
    console.log(`   Failed: ${results.summary.failed}`);
    console.log(`   Skipped: ${results.summary.skipped}`);
    console.log(`   Duration: ${results.summary.duration}ms`);
    console.log(`   Success Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(2)}%`);
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      status: 'healthy',
      framework: this.config.frameworkId,
      version: this.config.version,
      currentRun: this.getCurrentRunStatus(),
      statistics: this.getStatistics()
    };
  }

  /**
   * Stop testing framework
   */
  stop() {
    if (this.currentRun) {
      this.currentRun.status = 'cancelled';
      this.currentRun = null;
    }

    console.log(`🛑 Comprehensive Testing Framework stopped: ${this.config.frameworkId}`);
    this.emit('stopped');
  }
}

/**
 * JSON Reporter for test results
 */
class JSONReporter {
  constructor(config) {
    this.config = config;
  }

  async initialize(runConfig) {
    // Initialize JSON reporter
  }

  async generateReport(results, runConfig) {
    const report = {
      runId: results.runId,
      timestamp: new Date().toISOString(),
      summary: results.summary,
      suites: results.suites,
      config: runConfig
    };

    const fs = require('fs').promises;
    const reportPath = path.join(this.config.outputDir, `test-results-${results.runId}.json`);

    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 JSON report generated: ${reportPath}`);
  }
}

/**
 * HTML Reporter for test results
 */
class HTMLReporter {
  constructor(config) {
    this.config = config;
  }

  async initialize(runConfig) {
    // Initialize HTML reporter
  }

  async generateReport(results, runConfig) {
    const html = this.generateHTML(results, runConfig);
    const fs = require('fs').promises;
    const reportPath = path.join(this.config.outputDir, `test-results-${results.runId}.html`);

    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.writeFile(reportPath, html);

    console.log(`🌐 HTML report generated: ${reportPath}`);
  }

  generateHTML(results, runConfig) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Test Results - ${results.runId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e9ecef; padding: 15px; border-radius: 5px; text-align: center; }
        .passed { background: #d4edda; color: #155724; }
        .failed { background: #f8d7da; color: #721c24; }
        .skipped { background: #fff3cd; color: #856404; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f2f2f2; }
        .status-passed { color: #155724; }
        .status-failed { color: #721c24; }
        .status-skipped { color: #856404; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Results - ${results.runId}</h1>
        <p>Generated: ${new Date().toISOString()}</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>${results.summary.total}</h3>
            <p>Total Tests</p>
        </div>
        <div class="metric passed">
            <h3>${results.summary.passed}</h3>
            <p>Passed</p>
        </div>
        <div class="metric failed">
            <h3>${results.summary.failed}</h3>
            <p>Failed</p>
        </div>
        <div class="metric skipped">
            <h3>${results.summary.skipped}</h3>
            <p>Skipped</p>
        </div>
        <div class="metric">
            <h3>${results.summary.duration}ms</h3>
            <p>Duration</p>
        </div>
    </div>

    <h2>Test Suites</h2>
    <table>
        <thead>
            <tr>
                <th>Suite</th>
                <th>Type</th>
                <th>Tests</th>
                <th>Passed</th>
                <th>Failed</th>
                <th>Skipped</th>
                <th>Duration</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${results.suites.map(suite => `
                <tr>
                    <td>${suite.suiteName}</td>
                    <td>${suite.suiteType}</td>
                    <td>${suite.summary.total}</td>
                    <td>${suite.summary.passed}</td>
                    <td>${suite.summary.failed}</td>
                    <td>${suite.summary.skipped}</td>
                    <td>${suite.duration}ms</td>
                    <td class="status-${suite.status}">${suite.status}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>
    `;
  }
}

/**
 * JUnit Reporter for CI/CD integration
 */
class JUnitReporter {
  constructor(config) {
    this.config = config;
  }

  async initialize(runConfig) {
    // Initialize JUnit reporter
  }

  async generateReport(results, runConfig) {
    const xml = this.generateJUnitXML(results, runConfig);
    const fs = require('fs').promises;
    const reportPath = path.join(this.config.outputDir, `junit-${results.runId}.xml`);

    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.writeFile(reportPath, xml);

    console.log(`📋 JUnit report generated: ${reportPath}`);
  }

  generateJUnitXML(results, runConfig) {
    const escapeXML = (str) => {
      return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuites tests="${results.summary.total}" failures="${results.summary.failed}" time="${results.summary.duration / 1000}">\n`;

    for (const suite of results.suites) {
      xml += `  <testsuite name="${escapeXML(suite.suiteName)}" tests="${suite.summary.total}" failures="${suite.summary.failed}" time="${suite.duration / 1000}">\n`;

      for (const test of suite.tests) {
        xml += `    <testcase classname="${escapeXML(suite.suiteName)}" name="${escapeXML(test.testName)}" time="${test.duration / 1000}">`;

        if (test.status === 'failed') {
          xml += `\n      <failure message="${escapeXML(test.error.message)}">${escapeXML(test.error.stack || '')}</failure>\n    `;
        }

        xml += `</testcase>\n`;
      }

      xml += `  </testsuite>\n`;
    }

    xml += '</testsuites>';
    return xml;
  }
}

module.exports = ComprehensiveTestingFramework;