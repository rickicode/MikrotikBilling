#!/usr/bin/env node

/**
 * Commit Message Validation Script for Task Master 0.24.0
 *
 * Validates commit messages according to the format:
 * type(scope): description - @agent1 @agent2
 *
 * Usage: node scripts/validate-commit-message.js "<commit-message>"
 */

const fs = require('fs');
const path = require('path');

// Load Task Master configuration
const taskMasterConfigPath = path.join(__dirname, '../.taskmaster/git-workflow.json');
let taskMasterConfig;

try {
  taskMasterConfig = JSON.parse(fs.readFileSync(taskMasterConfigPath, 'utf8'));
} catch (error) {
  console.error('Error: Could not load Task Master Git workflow configuration');
  process.exit(1);
}

const validTypes = Object.keys(taskMasterConfig.commitTypes);
const validScopes = Object.keys(taskMasterConfig.scopes);
const validAgents = taskMasterConfig.validation.agentAttribution.validAgents;

function validateCommitMessage(commitMessage) {
  const errors = [];
  const warnings = [];

  // Basic pattern validation
  const pattern = /^(feat|fix|refactor|test|docs|style|perf|security|chore)\(([^)]+)\): (.+) - (@[a-z-]+(?: @[a-z-]+)?)$/;
  const match = commitMessage.match(pattern);

  if (!match) {
    errors.push('Commit message must follow format: type(scope): description - @agent1 @agent2');
    return { valid: false, errors, warnings, suggestions: getSuggestions() };
  }

  const [, type, scope, description, agents] = match;

  // Validate type
  if (!validTypes.includes(type)) {
    errors.push(`Invalid type "${type}". Valid types: ${validTypes.join(', ')}`);
  }

  // Validate scope
  if (!validScopes.includes(scope)) {
    errors.push(`Invalid scope "${scope}". Valid scopes: ${validScopes.join(', ')}`);
  }

  // Validate description
  if (description.length < 10) {
    warnings.push('Description should be at least 10 characters long');
  }

  if (description.length > 72) {
    warnings.push('Description should not exceed 72 characters');
  }

  if (description[0] !== description[0].toLowerCase()) {
    warnings.push('Description should start with a lowercase letter');
  }

  // Validate agents
  const mentionedAgents = agents.split(' ').filter(agent => agent.startsWith('@'));

  if (mentionedAgents.length === 0) {
    errors.push('At least one agent must be mentioned (@agent-name)');
  }

  for (const agent of mentionedAgents) {
    if (!validAgents.includes(agent)) {
      errors.push(`Invalid agent "${agent}". Valid agents: ${validAgents.map(a => a.substring(1)).join(', ')}`);
    }
  }

  // Check for duplicate agents
  const uniqueAgents = [...new Set(mentionedAgents)];
  if (uniqueAgents.length !== mentionedAgents.length) {
    warnings.push('Duplicate agents mentioned');
  }

  // Scope-specific validation
  const scopeConfig = taskMasterConfig.scopes[scope];
  if (scopeConfig) {
    const primaryAgents = scopeConfig.primaryAgents;
    let hasPrimaryAgent = false;

    for (const agent of mentionedAgents) {
      if (primaryAgents.includes(agent)) {
        hasPrimaryAgent = true;
        break;
      }
    }

    if (!hasPrimaryAgent) {
      warnings.push(`Scope "${scope}" typically includes one of: ${primaryAgents.join(', ')}`);
    }
  }

  // Type-specific validation
  const typeConfig = taskMasterConfig.commitTypes[type];
  if (typeConfig) {
    if (typeConfig.requiresTesting && !description.toLowerCase().includes('test')) {
      warnings.push(`Type "${type}" typically requires testing - consider adding test-related work`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions: [],
    parsed: {
      type,
      scope,
      description,
      agents: mentionedAgents
    }
  };
}

function getSuggestions() {
  return [
    'Examples of valid commit messages:',
    '',
    'feat(vouchers): implement batch generation - @nodejs-expert @api-architect',
    'fix(mikrotik): resolve API connection timeout - @network-engineer @performance-optimizer',
    'feat(plugins): add DuitKu payment gateway - @payment-systems-expert @plugin-developer',
    'test(whatsapp): add multi-session E2E tests - @test-automation-expert @messaging-specialist',
    'docs(api): update Mikrotik integration guide - @documentation-specialist @network-engineer',
    '',
    `Valid types: ${validTypes.join(', ')}`,
    `Valid scopes: ${validScopes.join(', ')}`,
    '',
    'Agent attribution format: @agent-name (space separated for multiple agents)'
  ];
}

function main() {
  const commitMessage = process.argv[2] || process.env.HUSKY_GIT_PARAMS || '';

  if (!commitMessage) {
    console.error('Error: No commit message provided');
    console.log('Usage: node scripts/validate-commit-message.js "<commit-message>"');
    process.exit(1);
  }

  // Read from commit message file if path provided
  if (commitMessage.includes('.git/COMMIT_EDITMSG')) {
    try {
      const messageContent = fs.readFileSync(commitMessage, 'utf8').trim();
      if (!messageContent) {
        console.error('Error: Empty commit message');
        process.exit(1);
      }
      const validation = validateCommitMessage(messageContent);
      outputValidation(validation);
      process.exit(validation.valid ? 0 : 1);
    } catch (error) {
      console.error('Error reading commit message file:', error.message);
      process.exit(1);
    }
  }

  const validation = validateCommitMessage(commitMessage);
  outputValidation(validation);
  process.exit(validation.valid ? 0 : 1);
}

function outputValidation(validation) {
  if (validation.valid) {
    console.log(' Commit message validation passed');
    if (validation.warnings.length > 0) {
      console.log('\n   Warnings:');
      validation.warnings.forEach(warning => console.log(`  - ${warning}`));
    }
    if (validation.parsed) {
      console.log(`\n=Ý Parsed: ${validation.parsed.type}(${validation.parsed.scope}): ${validation.parsed.description} - ${validation.parsed.agents.join(' ')}`);
    }
  } else {
    console.error('L Commit message validation failed');
    console.error('\n=« Errors:');
    validation.errors.forEach(error => console.error(`  - ${error}`));

    if (validation.warnings.length > 0) {
      console.error('\n   Warnings:');
      validation.warnings.forEach(warning => console.error(`  - ${warning}`));
    }

    if (validation.suggestions && validation.suggestions.length > 0) {
      console.error('\n=¡ Suggestions:');
      validation.suggestions.forEach(suggestion => console.error(`  ${suggestion}`));
    }
  }
}

// Export for testing
module.exports = {
  validateCommitMessage,
  validTypes,
  validScopes,
  validAgents
};

// Run if called directly
if (require.main === module) {
  main();
}