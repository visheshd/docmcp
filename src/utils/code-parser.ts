import logger from './logger';

/**
 * Interface representing a detected package/library
 */
export interface DetectedPackage {
  name: string;
  version?: string;
  language: string;
  importStatement: string;
}

/**
 * Language parsers for detecting imports
 */
export enum ProgrammingLanguage {
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
  PYTHON = 'python',
  JAVA = 'java',
  RUBY = 'ruby',
  PHP = 'php',
  GO = 'go',
  RUST = 'rust',
  UNKNOWN = 'unknown'
}

/**
 * Determine programming language from file extension
 */
export function detectLanguageFromExtension(filePath: string): ProgrammingLanguage {
  if (!filePath) return ProgrammingLanguage.UNKNOWN;
  
  const extension = filePath.toLowerCase().split('.').pop();
  
  switch (extension) {
    case 'js':
      return ProgrammingLanguage.JAVASCRIPT;
    case 'jsx':
      return ProgrammingLanguage.JAVASCRIPT;
    case 'ts':
      return ProgrammingLanguage.TYPESCRIPT;
    case 'tsx':
      return ProgrammingLanguage.TYPESCRIPT;
    case 'py':
      return ProgrammingLanguage.PYTHON;
    case 'java':
      return ProgrammingLanguage.JAVA;
    case 'rb':
      return ProgrammingLanguage.RUBY;
    case 'php':
      return ProgrammingLanguage.PHP;
    case 'go':
      return ProgrammingLanguage.GO;
    case 'rs':
      return ProgrammingLanguage.RUST;
    default:
      return ProgrammingLanguage.UNKNOWN;
  }
}

/**
 * Detect programming language from code content
 * This is a fallback when extension isn't available or reliable
 */
export function detectLanguageFromContent(code: string): ProgrammingLanguage {
  if (!code) return ProgrammingLanguage.UNKNOWN;
  
  // JavaScript/TypeScript detection
  if (code.includes('import ') || code.includes('require(') || code.includes('export ')) {
    // Look for TypeScript-specific syntax
    if (code.includes(': ') && (code.includes('interface ') || code.includes(': any') || code.includes(': string'))) {
      return ProgrammingLanguage.TYPESCRIPT;
    }
    
    // More aggressive Python detection to overcome false JavaScript positives
    if (code.includes('def ') && code.includes('if __name__ ==') && code.includes(':')) {
      return ProgrammingLanguage.PYTHON;
    }
    
    return ProgrammingLanguage.JAVASCRIPT;
  }
  
  // Python detection
  if (code.includes('import ') && (code.includes('def ') || code.includes('if __name__ =='))) {
    return ProgrammingLanguage.PYTHON;
  }
  
  // Java detection
  if (code.includes('public class ') || code.includes('import java.')) {
    return ProgrammingLanguage.JAVA;
  }
  
  // Ruby detection
  if (code.includes('require ') && (code.includes('def ') || code.includes('end'))) {
    return ProgrammingLanguage.RUBY;
  }
  
  // PHP detection
  if (code.includes('<?php') || code.includes('namespace ') || code.includes('use ')) {
    return ProgrammingLanguage.PHP;
  }
  
  // Go detection
  if (code.includes('package ') && code.includes('import (')) {
    return ProgrammingLanguage.GO;
  }
  
  // Rust detection
  if (code.includes('use ') && code.includes('fn ') && code.includes('struct ')) {
    return ProgrammingLanguage.RUST;
  }
  
  return ProgrammingLanguage.UNKNOWN;
}

/**
 * Parse JavaScript/TypeScript imports
 */
function parseJavaScriptImports(code: string, language: ProgrammingLanguage): DetectedPackage[] {
  const packages: DetectedPackage[] = [];
  
  try {
    // Remove comments first (both single line and multi-line)
    const codeWithoutComments = code
      .replace(/\/\/.*$/gm, '') // Remove single line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
    
    // ES6 import statements
    // Match: import X from 'package'
    // Match: import { X } from 'package'
    // Match: import * as X from 'package'
    const es6ImportRegex = /import\s+(?:(?:{\s*[\w\s,]+\s*})|(?:[\w]+(?:\s+as\s+[\w]+)?)|(?:\*\s+as\s+[\w]+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = es6ImportRegex.exec(codeWithoutComments)) !== null) {
      const packagePath = match[1];
      if (!isRelativePath(packagePath)) {
        // Extract root package name while preserving namespace for scoped packages
        let packageName: string;
        if (packagePath.startsWith('@')) {
          // For scoped packages like @angular/core, capture @angular as the package
          packageName = packagePath.split('/').slice(0, 2).join('/');
        } else {
          // For regular packages like lodash/fp, capture lodash as the package
          packageName = packagePath.split('/')[0];
        }
        
        packages.push({
          name: packageName,
          language: language,
          importStatement: match[0]
        });
      }
    }
    
    // CommonJS require statements
    // Match: require('package')
    // Match: const/let/var X = require('package')
    const requireRegex = /(?:const|let|var)?\s*(?:[\w\s{},.[\]]+)?\s*=?\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    while ((match = requireRegex.exec(codeWithoutComments)) !== null) {
      const packagePath = match[1];
      if (!isRelativePath(packagePath)) {
        let packageName: string;
        if (packagePath.startsWith('@')) {
          packageName = packagePath.split('/').slice(0, 2).join('/');
        } else {
          packageName = packagePath.split('/')[0];
        }
        
        packages.push({
          name: packageName,
          language: language,
          importStatement: match[0]
        });
      }
    }
    
    // Dynamic imports
    // Match: import('package')
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    while ((match = dynamicImportRegex.exec(codeWithoutComments)) !== null) {
      const packagePath = match[1];
      if (!isRelativePath(packagePath)) {
        let packageName: string;
        if (packagePath.startsWith('@')) {
          packageName = packagePath.split('/').slice(0, 2).join('/');
        } else {
          packageName = packagePath.split('/')[0];
        }
        
        packages.push({
          name: packageName,
          language: language,
          importStatement: match[0]
        });
      }
    }
  } catch (error) {
    logger.error('Error parsing JavaScript/TypeScript imports:', error);
  }
  
  return packages;
}

/**
 * Parse Python imports
 */
function parsePythonImports(code: string): DetectedPackage[] {
  const packages: DetectedPackage[] = [];
  
  try {
    // Remove comments first
    const codeWithoutComments = code.replace(/#.*/g, '');
    
    // Match: import package
    // Match: import package as alias
    const simpleImportRegex = /^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?/gm;
    let match;
    
    while ((match = simpleImportRegex.exec(codeWithoutComments)) !== null) {
      const importPath = match[1].trim();
      // Get the top-level package
      const packageName = importPath.split('.')[0];
      
      packages.push({
        name: packageName,
        language: ProgrammingLanguage.PYTHON,
        importStatement: match[0]
      });
    }
    
    // Match: from package import name
    // Match: from package.subpackage import name
    const fromImportRegex = /^\s*from\s+([\w.]+)\s+import\s+(?:[\w,\s*]+)/gm;
    
    while ((match = fromImportRegex.exec(codeWithoutComments)) !== null) {
      const importPath = match[1].trim();
      // Get the top-level package
      const packageName = importPath.split('.')[0];
      
      packages.push({
        name: packageName,
        language: ProgrammingLanguage.PYTHON,
        importStatement: match[0]
      });
    }
  } catch (error) {
    logger.error('Error parsing Python imports:', error);
  }
  
  return packages;
}

/**
 * Parse Java imports
 */
function parseJavaImports(code: string): DetectedPackage[] {
  const packages: DetectedPackage[] = [];
  
  try {
    // Match: import com.example.package;
    // Match: import com.example.package.Class;
    const importRegex = /^\s*import\s+([\w.]+);/gm;
    let match;
    
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1].trim();
      // Get first two parts of package name as the "library"
      const parts = importPath.split('.');
      if (parts.length >= 2) {
        const packageName = `${parts[0]}.${parts[1]}`;
        
        packages.push({
          name: packageName,
          language: ProgrammingLanguage.JAVA,
          importStatement: match[0]
        });
      }
    }
  } catch (error) {
    logger.error('Error parsing Java imports:', error);
  }
  
  return packages;
}

/**
 * Parse Ruby requires
 */
function parseRubyImports(code: string): DetectedPackage[] {
  const packages: DetectedPackage[] = [];
  
  try {
    // Match: require 'package'
    // Match: require_relative 'package'
    const requireRegex = /^\s*(?:require|require_relative)\s+['"]([^'"]+)['"]/gm;
    let match;
    
    while ((match = requireRegex.exec(code)) !== null) {
      const packagePath = match[1].trim();
      if (!isRelativePath(packagePath)) {
        packages.push({
          name: packagePath,
          language: ProgrammingLanguage.RUBY,
          importStatement: match[0]
        });
      }
    }
    
    // Match: gem 'package'
    const gemRegex = /^\s*gem\s+['"]([^'"]+)['"]/gm;
    
    while ((match = gemRegex.exec(code)) !== null) {
      const packageName = match[1].trim().split(/\s+/)[0]; // Handle version constraints
      
      packages.push({
        name: packageName,
        language: ProgrammingLanguage.RUBY,
        importStatement: match[0]
      });
    }
  } catch (error) {
    logger.error('Error parsing Ruby imports:', error);
  }
  
  return packages;
}

/**
 * Parse PHP imports
 */
function parsePHPImports(code: string): DetectedPackage[] {
  const packages: DetectedPackage[] = [];
  
  try {
    // Match: use Package\Name;
    // Match: use Package\Name as Alias;
    const useRegex = /^\s*use\s+([\w\\]+)(?:\s+as\s+\w+)?;/gm;
    let match;
    
    while ((match = useRegex.exec(code)) !== null) {
      const namespace = match[1].trim();
      // Get the top-level namespace
      const packageName = namespace.split('\\')[0];
      
      packages.push({
        name: packageName,
        language: ProgrammingLanguage.PHP,
        importStatement: match[0]
      });
    }
    
    // Match: require 'vendor/autoload.php';
    // This indicates Composer dependencies
    if (code.includes("require 'vendor/autoload.php'") || code.includes('require "vendor/autoload.php"')) {
      packages.push({
        name: 'composer',
        language: ProgrammingLanguage.PHP,
        importStatement: "require 'vendor/autoload.php'"
      });
    }
  } catch (error) {
    logger.error('Error parsing PHP imports:', error);
  }
  
  return packages;
}

/**
 * Parse Go imports
 */
function parseGoImports(code: string): DetectedPackage[] {
  const packages: DetectedPackage[] = [];
  
  try {
    // Match single imports: import "package"
    const singleImportRegex = /^\s*import\s+(?:[\w.]+\s+)?["']([^"']+)["']/gm;
    let match;
    
    while ((match = singleImportRegex.exec(code)) !== null) {
      const importPath = match[1].trim();
      // Extract the package/repo name
      const parts = importPath.split('/');
      if (parts.length >= 2) {
        // For go imports like "github.com/user/repo"
        const packageName = parts.slice(0, 3).join('/');
        
        packages.push({
          name: packageName,
          language: ProgrammingLanguage.GO,
          importStatement: match[0]
        });
      } else {
        // Standard library
        packages.push({
          name: importPath,
          language: ProgrammingLanguage.GO,
          importStatement: match[0]
        });
      }
    }
    
    // Match block imports: import ( "package1" "package2" )
    const blockImport = code.match(/import\s*\(([\s\S]*?)\)/);
    if (blockImport) {
      const blockContent = blockImport[1];
      const importsRegex = /["']([^"']+)["']/g;
      
      while ((match = importsRegex.exec(blockContent)) !== null) {
        const importPath = match[1].trim();
        const parts = importPath.split('/');
        if (parts.length >= 2) {
          const packageName = parts.slice(0, 3).join('/');
          
          packages.push({
            name: packageName,
            language: ProgrammingLanguage.GO,
            importStatement: `import "${importPath}"`
          });
        } else {
          packages.push({
            name: importPath,
            language: ProgrammingLanguage.GO,
            importStatement: `import "${importPath}"`
          });
        }
      }
    }
  } catch (error) {
    logger.error('Error parsing Go imports:', error);
  }
  
  return packages;
}

/**
 * Parse Rust imports
 */
function parseRustImports(code: string): DetectedPackage[] {
  const packages: DetectedPackage[] = [];
  
  try {
    // Match: use std::module;
    // Match: use package::module;
    const useRegex = /^\s*use\s+([\w:]+)(?:::\{[^}]+\})?;/gm;
    let match;
    
    while ((match = useRegex.exec(code)) !== null) {
      const importPath = match[1].trim();
      // Get the top-level crate
      const packageName = importPath.split('::')[0];
      
      // Skip std library
      if (packageName !== 'std' && packageName !== 'core') {
        packages.push({
          name: packageName,
          language: ProgrammingLanguage.RUST,
          importStatement: match[0]
        });
      }
    }
    
    // Look for Cargo.toml dependencies in comments
    const cargoRegex = /^\s*\/\/\s*(?:dependencies|Cargo\.toml).*?[\s'"]([\w-]+)[\s'"]/gm;
    
    while ((match = cargoRegex.exec(code)) !== null) {
      const packageName = match[1].trim();
      
      packages.push({
        name: packageName,
        language: ProgrammingLanguage.RUST,
        importStatement: match[0]
      });
    }
  } catch (error) {
    logger.error('Error parsing Rust imports:', error);
  }
  
  return packages;
}

/**
 * Utility to check if a path is relative
 */
function isRelativePath(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../') || path === '.' || path === '..';
}

/**
 * Parse code to extract import statements and detect packages
 */
export function parseCode(code: string, filename?: string): DetectedPackage[] {
  if (!code) return [];
  
  try {
    // Determine the programming language
    let language = ProgrammingLanguage.UNKNOWN;
    
    if (filename) {
      language = detectLanguageFromExtension(filename);
    }
    
    if (language === ProgrammingLanguage.UNKNOWN) {
      language = detectLanguageFromContent(code);
    }
    
    // Parse imports based on the detected language
    switch (language) {
      case ProgrammingLanguage.JAVASCRIPT:
      case ProgrammingLanguage.TYPESCRIPT:
        return parseJavaScriptImports(code, language);
      case ProgrammingLanguage.PYTHON:
        return parsePythonImports(code);
      case ProgrammingLanguage.JAVA:
        return parseJavaImports(code);
      case ProgrammingLanguage.RUBY:
        return parseRubyImports(code);
      case ProgrammingLanguage.PHP:
        return parsePHPImports(code);
      case ProgrammingLanguage.GO:
        return parseGoImports(code);
      case ProgrammingLanguage.RUST:
        return parseRustImports(code);
      default:
        return [];
    }
  } catch (error) {
    logger.error('Error parsing code:', error);
    return [];
  }
}

/**
 * Filter out standard library packages and normalize package names
 */
export function normalizePackages(packages: DetectedPackage[]): DetectedPackage[] {
  const normalized = new Map<string, DetectedPackage>();
  
  for (const pkg of packages) {
    // Skip standard library packages for certain languages
    if (shouldSkipPackage(pkg)) continue;
    
    // Create a unique key for the package
    const key = `${pkg.name}-${pkg.language}`;
    
    // Only add if not already in the map
    if (!normalized.has(key)) {
      normalized.set(key, pkg);
    }
  }
  
  return Array.from(normalized.values());
}

/**
 * Check if a package should be skipped (e.g., standard library)
 */
function shouldSkipPackage(pkg: DetectedPackage): boolean {
  const { name, language } = pkg;
  
  // JavaScript/TypeScript standard libraries
  if ((language === ProgrammingLanguage.JAVASCRIPT || language === ProgrammingLanguage.TYPESCRIPT) && 
      ['fs', 'path', 'http', 'https', 'url', 'util', 'crypto'].includes(name)) {
    return true;
  }
  
  // Python standard libraries
  if (language === ProgrammingLanguage.PYTHON && 
      ['os', 'sys', 're', 'datetime', 'math', 'random', 'json', 'csv'].includes(name)) {
    return true;
  }
  
  // Java standard libraries
  if (language === ProgrammingLanguage.JAVA && 
      ['java.lang', 'java.util', 'java.io', 'java.net'].includes(name)) {
    return true;
  }
  
  // Go standard libraries
  if (language === ProgrammingLanguage.GO && 
      !name.includes('/')) {
    return true;
  }
  
  return false;
}

/**
 * Get the main packages from code
 */
export function getPackagesFromCode(code: string, filename?: string): string[] {
  const detectedPackages = parseCode(code, filename);
  const normalizedPackages = normalizePackages(detectedPackages);
  
  return normalizedPackages.map(pkg => pkg.name);
} 