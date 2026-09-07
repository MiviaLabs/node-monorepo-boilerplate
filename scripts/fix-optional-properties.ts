#!/usr/bin/env node
/**
 * Bulk fix for exactOptionalPropertyTypes errors
 *
 * This script fixes common patterns that cause TS2375, TS2379, TS2412 errors
 * when exactOptionalPropertyTypes is enabled in tsconfig.
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

interface FixPattern {
  test: RegExp;
  fix: (match: RegExpMatchArray) => string;
  description: string;
}

const fixPatterns: FixPattern[] = [
  {
    description: 'Remove explicit undefined from object properties',
    test: /(\w+):\s*undefined,\s*\/\/.*$/gm,
    fix: (match) => '' // Remove the line
  },
  {
    description: 'Fix object spreading with optional properties',
    test: /\{\s*([^}]+):\s*(\w+\s*\|\s*undefined)[,\s}]/g,
    fix: (match) => {
      const [, propName, propType] = match;
      return `{ ...(${propName} !== undefined && { ${propName} }) }`;
    }
  }
];

function applyFixes(content: string): string {
  let fixed = content;

  // Pattern 1: Remove explicit undefined assignments in object literals
  fixed = fixed.replace(/(\w+):\s*undefined,\s*\/\/.*$/gm, '');

  // Pattern 2: Fix conditional object property spreading
  // This is complex, so we'll handle specific cases

  return fixed;
}

function main() {
  const files = glob.sync('packages/**/*.ts', {
    cwd: process.cwd(),
    absolute: true
  });

  let fixedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      let content = readFileSync(file, 'utf-8');
      const original = content;
      content = applyFixes(content);

      if (content !== original) {
        writeFileSync(file, content, 'utf-8');
        fixedCount++;
        console.log(`Fixed: ${file}`);
      }
    } catch (error) {
      errorCount++;
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`\nFixed ${fixedCount} files, ${errorCount} errors`);
}

main();
