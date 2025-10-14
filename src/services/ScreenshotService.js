const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ScreenshotService {
  constructor() {
    this.defaultOptions = {
      fullPage: true,
      quality: 80,
      type: 'png',
      animations: 'disabled'
    };
    this.compressionEnabled = true;
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
  }

  // Take screenshot with enhanced options
  async takeScreenshot(page, options = {}) {
    const config = { ...this.defaultOptions, ...options };

    try {
      // Generate unique filename
      const filename = this.generateFilename(config.filename);
      const screenshotPath = path.join(config.outputDir || 'tests/screenshots', filename);

      // Take screenshot
      const buffer = await page.screenshot({
        path: screenshotPath,
        fullPage: config.fullPage,
        type: config.type,
        quality: config.type === 'jpeg' ? config.quality : undefined,
        animations: config.animations
      });

      // Get screenshot metadata
      const metadata = await this.extractScreenshotMetadata(page, buffer, config);

      // Compress if needed
      if (this.compressionEnabled && buffer.length > this.maxFileSize) {
        await this.compressScreenshot(screenshotPath, buffer, config);
      }

      return {
        success: true,
        path: screenshotPath,
        filename,
        size: buffer.length,
        metadata
      };

    } catch (error) {
      console.error('Failed to take screenshot:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Take screenshot of specific element
  async takeElementScreenshot(page, selector, options = {}) {
    const config = { ...this.defaultOptions, ...options };

    try {
      const element = await page.locator(selector).first();
      if (!(await element.isVisible())) {
        throw new Error(`Element not visible: ${selector}`);
      }

      // Generate filename for element
      const elementName = selector.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = this.generateFilename(`${config.filename || 'element'}_${elementName}`);
      const screenshotPath = path.join(config.outputDir || 'tests/screenshots', filename);

      // Take element screenshot
      const buffer = await element.screenshot({
        path: screenshotPath,
        type: config.type,
        quality: config.type === 'jpeg' ? config.quality : undefined,
        animations: config.animations
      });

      // Get element metadata
      const boundingBox = await element.boundingBox();
      const metadata = {
        element: selector,
        boundingBox,
        size: buffer.length,
        timestamp: new Date().toISOString()
      };

      return {
        success: true,
        path: screenshotPath,
        filename,
        size: buffer.length,
        metadata
      };

    } catch (error) {
      console.error('Failed to take element screenshot:', error);
      return {
        success: false,
        error: error.message,
        selector
      };
    }
  }

  // Take comparison screenshots (before/after)
  async takeComparisonScreenshots(page, action, options = {}) {
    const config = { ...this.defaultOptions, ...options };

    try {
      // Take "before" screenshot
      const beforeResult = await this.takeScreenshot(page, {
        ...config,
        filename: `${config.filename || 'comparison'}_before`
      });

      if (!beforeResult.success) {
        return beforeResult;
      }

      // Execute the action
      if (typeof action === 'function') {
        await action(page);
      }

      // Wait for action to complete
      await page.waitForTimeout(config.waitTime || 1000);

      // Take "after" screenshot
      const afterResult = await this.takeScreenshot(page, {
        ...config,
        filename: `${config.filename || 'comparison'}_after`
      });

      return {
        success: true,
        before: beforeResult,
        after: afterResult
      };

    } catch (error) {
      console.error('Failed to take comparison screenshots:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Take responsive screenshots across multiple viewports
  async takeResponsiveScreenshots(page, viewports, options = {}) {
    const config = { ...this.defaultOptions, ...options };
    const results = [];

    for (const viewport of viewports) {
      try {
        // Set viewport
        await page.setViewportSize(viewport);

        // Wait for layout to adjust
        await page.waitForTimeout(500);

        // Take screenshot
        const viewportName = `${viewport.width}x${viewport.height}`;
        const result = await this.takeScreenshot(page, {
          ...config,
          filename: `${config.filename || 'responsive'}_${viewportName}`
        });

        if (result.success) {
          result.metadata.viewport = viewport;
          result.metadata.viewportName = viewportName;
        }

        results.push({
          viewport: viewport,
          viewportName,
          ...result
        });

      } catch (error) {
        console.error(`Failed to take screenshot for viewport ${viewport.width}x${viewport.height}:`, error);
        results.push({
          viewport: viewport,
          viewportName: `${viewport.width}x${viewport.height}`,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: results.some(r => r.success),
      screenshots: results,
      totalScreenshots: results.length,
      successfulScreenshots: results.filter(r => r.success).length
    };
  }

  // Take screenshot on error/exception
  async takeErrorScreenshot(page, error, options = {}) {
    const config = {
      ...this.defaultOptions,
      ...options,
      filename: `error_${Date.now()}_${error.name || 'unknown'}`
    };

    try {
      // Add error overlay to page
      await this.addErrorOverlay(page, error);

      // Take screenshot
      const result = await this.takeScreenshot(page, config);

      if (result.success) {
        result.metadata.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
      }

      return result;

    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError);
      return {
        success: false,
        error: screenshotError.message,
        originalError: error.message
      };
    }
  }

  // Generate visual diff between two screenshots
  async generateVisualDiff(beforePath, afterPath, outputPath, options = {}) {
    try {
      // This would require additional image processing libraries
      // For now, return a placeholder implementation
      const diffResult = {
        success: true,
        beforePath,
        afterPath,
        outputPath,
        difference: 0,
        message: 'Visual diff generation not fully implemented'
      };

      return diffResult;

    } catch (error) {
      console.error('Failed to generate visual diff:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create screenshot gallery HTML
  async createScreenshotGallery(screenshots, outputPath, options = {}) {
    try {
      const {
        title = 'Test Results Gallery',
        description = 'Automated test screenshots',
        includeThumbnails = true,
        groupBy = 'none' // none, date, test_type, viewport
      } = options;

      // Group screenshots if requested
      const groupedScreenshots = this.groupScreenshots(screenshots, groupBy);

      // Generate HTML
      const html = this.generateGalleryHTML(groupedScreenshots, {
        title,
        description,
        includeThumbnails,
        groupBy
      });

      // Write HTML file
      await fs.writeFile(outputPath, html);

      return {
        success: true,
        path: outputPath,
        screenshotCount: screenshots.length,
        html
      };

    } catch (error) {
      console.error('Failed to create screenshot gallery:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Add error overlay to page
  async addErrorOverlay(page, error) {
    try {
      const overlayHTML = `
        <div id="error-overlay" style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255, 0, 0, 0.1);
          border: 5px solid red;
          z-index: 9999;
          pointer-events: none;
          font-family: monospace;
          font-size: 14px;
          color: red;
          padding: 10px;
          box-sizing: border-box;
        ">
          <div style="background: white; padding: 10px; margin: 10px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">
            <h3 style="margin: 0 0 10px 0; color: red;">ERROR: ${error.name || 'Unknown'}</h3>
            <p style="margin: 0 0 10px 0; white-space: pre-wrap;">${error.message}</p>
            <small style="opacity: 0.7;">${new Date().toISOString()}</small>
          </div>
        </div>
      `;

      await page.evaluate((html) => {
        const overlay = document.createElement('div');
        overlay.innerHTML = html;
        document.body.appendChild(overlay.firstElementChild);
      }, overlayHTML);

    } catch (error) {
      console.error('Failed to add error overlay:', error);
    }
  }

  // Extract screenshot metadata
  async extractScreenshotMetadata(page, buffer, config) {
    try {
      const viewportSize = page.viewportSize();
      const url = page.url();
      const title = await page.title();

      return {
        timestamp: new Date().toISOString(),
        url,
        title,
        viewportSize,
        fileSize: buffer.length,
        format: config.type,
        fullPage: config.fullPage,
        quality: config.quality
      };

    } catch (error) {
      console.error('Failed to extract screenshot metadata:', error);
      return {
        timestamp: new Date().toISOString(),
        fileSize: buffer.length,
        format: config.type
      };
    }
  }

  // Generate unique filename
  generateFilename(prefix = 'screenshot') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${timestamp}_${random}.png`;
  }

  // Compress screenshot if too large
  async compressScreenshot(filePath, buffer, config) {
    try {
      // Simple compression - in a real implementation, you might use
      // libraries like sharp for image processing
      if (config.type === 'png' && buffer.length > this.maxFileSize) {
        // Try JPEG with lower quality
        const jpegPath = filePath.replace('.png', '.jpg');
        // This would require image processing library
        console.log(`Screenshot too large (${buffer.length} bytes), consider compression`);
      }

    } catch (error) {
      console.error('Failed to compress screenshot:', error);
    }
  }

  // Group screenshots for gallery
  groupScreenshots(screenshots, groupBy) {
    if (groupBy === 'none') {
      return { 'All Screenshots': screenshots };
    }

    const groups = {};

    screenshots.forEach(screenshot => {
      let key = 'Ungrouped';

      switch (groupBy) {
        case 'date':
          const date = new Date(screenshot.metadata.timestamp).toDateString();
          key = date;
          break;
        case 'test_type':
          key = screenshot.metadata.testType || 'Unknown';
          break;
        case 'viewport':
          key = screenshot.metadata.viewportName || 'Default';
          break;
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(screenshot);
    });

    return groups;
  }

  // Generate gallery HTML
  generateGalleryHTML(groupedScreenshots, options) {
    const { title, description, includeThumbnails, groupBy } = options;

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #eee;
            padding-bottom: 20px;
        }
        .group {
            margin-bottom: 40px;
        }
        .group-title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
            color: #333;
        }
        .screenshots {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .screenshot {
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow: hidden;
            transition: transform 0.2s;
        }
        .screenshot:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .screenshot img {
            width: 100%;
            height: auto;
            display: block;
        }
        .screenshot-info {
            padding: 10px;
            background: #f9f9f9;
            font-size: 12px;
            color: #666;
        }
        .screenshot-title {
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }
        .thumbnail {
            max-height: 200px;
            object-fit: cover;
        }
        .metadata {
            font-size: 11px;
            line-height: 1.4;
        }
        .no-screenshots {
            text-align: center;
            color: #666;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
            <p>${description}</p>
            <p><small>Generated on ${new Date().toLocaleString()}</small></p>
        </div>
`;

    Object.entries(groupedScreenshots).forEach(([groupName, screenshots]) => {
      html += `
        <div class="group">
            <h2 class="group-title">${groupName} (${screenshots.length})</h2>
            <div class="screenshots">
      `;

      if (screenshots.length === 0) {
        html += '<div class="no-screenshots">No screenshots available</div>';
      } else {
        screenshots.forEach(screenshot => {
          const imgClass = includeThumbnails ? 'thumbnail' : '';
          const metadata = screenshot.metadata || {};

          html += `
            <div class="screenshot">
                <img src="${path.basename(screenshot.path)}" alt="${screenshot.filename}" class="${imgClass}">
                <div class="screenshot-info">
                    <div class="screenshot-title">${screenshot.filename}</div>
                    <div class="metadata">
                        <div>Size: ${(screenshot.size / 1024).toFixed(1)} KB</div>
                        ${metadata.url ? `<div>URL: ${metadata.url}</div>` : ''}
                        ${metadata.timestamp ? `<div>Captured: ${new Date(metadata.timestamp).toLocaleString()}</div>` : ''}
                        ${metadata.viewportSize ? `<div>Viewport: ${metadata.viewportSize.width}x${metadata.viewportSize.height}</div>` : ''}
                    </div>
                </div>
            </div>
          `;
        });
      }

      html += `
            </div>
        </div>
      `;
    });

    html += `
    </div>
</body>
</html>
    `;

    return html;
  }

  // Clean up old screenshots
  async cleanupOldScreenshots(directoryPath, retentionDays = 30) {
    try {
      const files = await fs.readdir(directoryPath);
      const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      return {
        success: true,
        deletedFiles: deletedCount,
        message: `Deleted ${deletedCount} old screenshot files`
      };

    } catch (error) {
      console.error('Failed to cleanup old screenshots:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get screenshot statistics
  async getScreenshotStats(directoryPath) {
    try {
      const files = await fs.readdir(directoryPath);
      let totalSize = 0;
      let screenshotCount = 0;
      const formatStats = {};

      for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          screenshotCount++;
          totalSize += stats.size;

          const ext = path.extname(file).toLowerCase();
          formatStats[ext] = (formatStats[ext] || 0) + 1;
        }
      }

      return {
        success: true,
        totalScreenshots: screenshotCount,
        totalSize,
        averageSize: screenshotCount > 0 ? totalSize / screenshotCount : 0,
        formatStats,
        directoryPath
      };

    } catch (error) {
      console.error('Failed to get screenshot stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ScreenshotService;