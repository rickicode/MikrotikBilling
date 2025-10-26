const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Distributed Tracing Middleware
 * Provides comprehensive request tracing across services and external APIs
 * Implements OpenTelemetry-like patterns for observability
 */
class DistributedTracing {
  constructor(config = {}) {
    this.config = {
      serviceName: config.serviceName || 'mikrotik-billing',
      serviceVersion: config.serviceVersion || '1.0.0',
      enableTracing: config.enableTracing !== false,
      sampleRate: config.sampleRate || 1.0, // 100% sampling by default
      maxSpansPerTrace: config.maxSpansPerTrace || 1000,
      exportInterval: config.exportInterval || 10000, // 10 seconds
      enableBaggagePropagation: config.enableBaggagePropagation !== false,
      enableMetrics: config.enableMetrics !== false,
      ...config
    };

    this.activeTraces = new Map();
    this.spanBuffer = [];
    this.metrics = {
      tracesCreated: 0,
      spansCreated: 0,
      errors: 0,
      latencies: []
    };

    this.exportTimer = null;
    this.isStarted = false;
  }

  /**
   * Start the tracing service
   */
  start() {
    if (this.isStarted || !this.config.enableTracing) return;

    this.isStarted = true;

    // Start periodic export
    this.startPeriodicExport();

    console.log(`🔍 Distributed tracing started for ${this.config.serviceName}`);
  }

  /**
   * Stop the tracing service
   */
  stop() {
    if (!this.isStarted) return;

    this.isStarted = false;

    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }

    // Export remaining spans
    this.exportSpans();

    console.log('🔍 Distributed tracing stopped');
  }

  /**
   * Start a new trace
   */
  startTrace(operationName, options = {}) {
    const traceId = options.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();

    const trace = {
      traceId,
      spanId,
      parentSpanId: options.parentSpanId || null,
      operationName,
      startTime: Date.now(),
      endTime: null,
      status: 'running',
      tags: options.tags || {},
      baggage: options.baggage || {},
      service: this.config.serviceName,
      resource: operationName,
      spans: []
    };

    this.activeTraces.set(traceId, trace);
    this.metrics.tracesCreated++;

    return trace;
  }

  /**
   * Start a span within an existing trace
   */
  startSpan(traceId, operationName, options = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    // Check span limit
    if (trace.spans.length >= this.config.maxSpansPerTrace) {
      console.warn(`Max spans per trace exceeded for trace: ${traceId}`);
      return null;
    }

    const spanId = this.generateSpanId();
    const span = {
      spanId,
      parentSpanId: options.parentSpanId || trace.spanId,
      operationName,
      startTime: Date.now(),
      endTime: null,
      status: 'running',
      tags: options.tags || {},
      logs: [],
      service: this.config.serviceName,
      resource: operationName
    };

    trace.spans.push(span);
    this.metrics.spansCreated++;

    return span;
  }

  /**
   * Finish a span
   */
  finishSpan(traceId, spanId, options = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return false;

    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) return false;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = options.status || 'ok';
    span.error = options.error || null;

    if (options.error) {
      span.status = 'error';
      this.metrics.errors++;
    }

    // Add tags
    if (options.tags) {
      Object.assign(span.tags, options.tags);
    }

    return true;
  }

  /**
   * Finish a trace
   */
  finishTrace(traceId, options = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return false;

    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = options.status || 'ok';
    trace.error = options.error || null;

    if (options.error) {
      trace.status = 'error';
      this.metrics.errors++;
    }

    // Add final tags
    if (options.tags) {
      Object.assign(trace.tags, options.tags);
    }

    // Move trace to export buffer
    this.spanBuffer.push(trace);
    this.activeTraces.delete(traceId);

    // Record metrics
    if (this.config.enableMetrics) {
      this.recordMetrics(trace);
    }

    return true;
  }

  /**
   * Add baggage to trace (propagated across services)
   */
  addBaggage(traceId, key, value) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return false;

    trace.baggage[key] = value;
    return true;
  }

  /**
   * Add tag to span
   */
  addTag(traceId, spanId, key, value) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return false;

    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) return false;

    span.tags[key] = value;
    return true;
  }

  /**
   * Add log entry to span
   */
  addLog(traceId, spanId, message, level = 'info', data = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return false;

    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) return false;

    span.logs.push({
      timestamp: Date.now(),
      level,
      message,
      data
    });

    return true;
  }

  /**
   * Extract trace context from headers
   */
  extractTraceContext(headers = {}) {
    return {
      traceId: headers['x-trace-id'] || headers['traceparent']?.split('-')[1],
      parentSpanId: headers['x-parent-span-id'] || headers['traceparent']?.split('-')[2],
      baggage: this.extractBaggage(headers)
    };
  }

  /**
   * Inject trace context into headers
   */
  injectTraceContext(traceId, spanId, existingHeaders = {}) {
    const headers = { ...existingHeaders };

    // Inject trace ID
    if (traceId) {
      headers['x-trace-id'] = traceId;

      // W3C traceparent format
      headers['traceparent'] = `00-${traceId}-${spanId || '0000000000000000'}-01`;
    }

    // Inject parent span ID
    if (spanId) {
      headers['x-parent-span-id'] = spanId;
    }

    // Inject baggage
    const trace = this.activeTraces.get(traceId);
    if (trace && Object.keys(trace.baggage).length > 0) {
      headers['baggage'] = Object.entries(trace.baggage)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
    }

    return headers;
  }

  /**
   * Extract baggage from headers
   */
  extractBaggage(headers = {}) {
    const baggage = {};
    const baggageHeader = headers['baggage'] || '';

    if (baggageHeader) {
      baggageHeader.split(',').forEach(item => {
        const [key, value] = item.trim().split('=');
        if (key && value) {
          baggage[key] = decodeURIComponent(value);
        }
      });
    }

    return baggage;
  }

  /**
   * Get trace statistics
   */
  getStatistics() {
    return {
      activeTraces: this.activeTraces.size,
      bufferedSpans: this.spanBuffer.length,
      metrics: { ...this.metrics },
      uptime: this.isStarted ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Get active traces
   */
  getActiveTraces() {
    return Array.from(this.activeTraces.values()).map(trace => ({
      ...trace,
      spans: trace.spans.map(span => ({
        ...span,
        duration: span.endTime ? span.endTime - span.startTime : Date.now() - span.startTime
      }))
    }));
  }

  /**
   * Search traces by criteria
   */
  searchTraces(criteria = {}) {
    const {
      operationName,
      service,
      status,
      minDuration,
      maxDuration,
      tags
    } = criteria;

    let traces = this.getActiveTraces();

    // Filter by operation name
    if (operationName) {
      traces = traces.filter(trace =>
        trace.operationName.includes(operationName) ||
        trace.spans.some(span => span.operationName.includes(operationName))
      );
    }

    // Filter by service
    if (service) {
      traces = traces.filter(trace => trace.service === service);
    }

    // Filter by status
    if (status) {
      traces = traces.filter(trace => trace.status === status);
    }

    // Filter by duration
    if (minDuration !== undefined || maxDuration !== undefined) {
      traces = traces.filter(trace => {
        const duration = trace.endTime ? trace.endTime - trace.startTime : Date.now() - trace.startTime;
        if (minDuration !== undefined && duration < minDuration) return false;
        if (maxDuration !== undefined && duration > maxDuration) return false;
        return true;
      });
    }

    // Filter by tags
    if (tags) {
      traces = traces.filter(trace => {
        return Object.entries(tags).every(([key, value]) => {
          const traceTagValue = trace.tags[key];
          if (traceTagValue === undefined) return false;
          if (typeof value === 'string' && !traceTagValue.includes(value)) return false;
          return traceTagValue === value;
        });
      });
    }

    return traces;
  }

  // Private methods

  generateTraceId() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateSpanId() {
    return crypto.randomBytes(8).toString('hex');
  }

  startPeriodicExport() {
    this.exportTimer = setInterval(() => {
      this.exportSpans();
    }, this.config.exportInterval);
  }

  exportSpans() {
    if (this.spanBuffer.length === 0) return;

    const spansToExport = [...this.spanBuffer];
    this.spanBuffer = [];

    // In a real implementation, this would send to a tracing backend
    // For now, we'll log and clear the buffer
    console.log(`🔍 Exporting ${spansToExport.length} traces`);

    spansToExport.forEach(trace => {
      console.log(`Trace ${trace.traceId}: ${trace.operationName} (${trace.duration}ms)`);
    });
  }

  recordMetrics(trace) {
    if (trace.duration) {
      this.metrics.latencies.push(trace.duration);

      // Keep only last 1000 latencies
      if (this.metrics.latencies.length > 1000) {
        this.metrics.latencies = this.metrics.latencies.slice(-1000);
      }
    }
  }
}

/**
 * Express/Fastify middleware for distributed tracing
 */
function createTracingMiddleware(tracing, options = {}) {
  const {
    operationNameExtractor = (req) => `${req.method} ${req.url}`,
    tagExtractor = (req) => ({
      'http.method': req.method,
      'http.url': req.url,
      'http.user_agent': req.headers['user-agent'],
      'http.remote_addr': req.ip || req.headers['x-forwarded-for']
    }),
    ignorePaths = ['/health', '/metrics', '/favicon.ico']
  } = options;

  return async (request, reply) => {
    // Skip ignored paths
    if (ignorePaths.some(path => request.url.startsWith(path))) {
      return;
    }

    // Extract existing trace context or create new one
    const traceContext = tracing.extractTraceContext(request.headers);

    let traceId, parentSpanId;

    if (traceContext.traceId) {
      traceId = traceContext.traceId;
      parentSpanId = traceContext.parentSpanId;
    } else {
      const trace = tracing.startTrace(operationNameExtractor(request), {
        baggage: traceContext.baggage
      });
      traceId = trace.traceId;
    }

    // Start request span
    const spanId = tracing.startSpan(traceId, operationNameExtractor(request), {
      parentSpanId,
      tags: tagExtractor(request)
    });

    if (!spanId) return; // Max spans exceeded

    // Store trace context in request
    request.traceId = traceId;
    request.spanId = spanId;
    request.tracing = tracing;

    // Inject trace context into response headers
    reply.header('x-trace-id', traceId);
    reply.header('x-span-id', spanId);

    // Setup response handling
    const startTime = Date.now();

    const originalReply = reply.send.bind(reply);
    reply.send = function(payload) {
      const duration = Date.now() - startTime;

      // Add response tags
      tracing.addTag(traceId, spanId, 'http.status_code', reply.statusCode);
      tracing.addTag(traceId, spanId, 'http.response_size', JSON.stringify(payload || '').length);

      // Log request completion
      tracing.addLog(traceId, spanId, 'Request completed', 'info', {
        statusCode: reply.statusCode,
        duration,
        responseSize: JSON.stringify(payload || '').length
      });

      // Finish span
      tracing.finishSpan(traceId, spanId, {
        status: reply.statusCode < 400 ? 'ok' : 'error',
        tags: {
          'http.status_code': reply.statusCode,
          'http.duration': duration
        }
      });

      return originalReply(payload);
    };

    // Setup error handling
    request.addHook('onError', async (request, reply, error) => {
      tracing.addLog(traceId, spanId, `Request error: ${error.message}`, 'error', {
        stack: error.stack,
        statusCode: error.statusCode || 500
      });

      tracing.addTag(traceId, spanId, 'error', true);
      tracing.addTag(traceId, spanId, 'error.type', error.name);
      tracing.addTag(traceId, spanId, 'error.message', error.message);

      tracing.finishSpan(traceId, spanId, {
        status: 'error',
        error: error.message
      });
    });
  };
}

/**
 * Service call tracer utility
 */
function createServiceCallTracer(tracing) {
  return {
    async traceCall(serviceName, operation, args = {}, options = {}) {
      const traceId = options.traceId || tracing.generateTraceId();
      const operationName = `${serviceName}.${operation}`;

      // Start trace
      const trace = tracing.startTrace(operationName, {
        traceId,
        tags: {
          'service.name': serviceName,
          'service.operation': operation,
          'service.call': true
        }
      });

      try {
        // Execute the operation
        const result = await options.execute?.(...args);

        // Finish trace successfully
        tracing.finishTrace(traceId, {
          status: 'ok',
          tags: {
            'service.result': 'success',
            'service.duration': trace.endTime - trace.startTime
          }
        });

        return result;

      } catch (error) {
        // Finish trace with error
        tracing.finishTrace(traceId, {
          status: 'error',
          error: error.message,
          tags: {
            'service.result': 'error',
            'service.error.type': error.name,
            'service.error.message': error.message
          }
        });

        throw error;
      }
    }
  };
}

module.exports = {
  DistributedTracing,
  createTracingMiddleware,
  createServiceCallTracer
};