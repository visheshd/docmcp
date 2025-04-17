import {
  detectLanguageFromExtension,
  detectLanguageFromContent,
  parseCode,
  getPackagesFromCode,
  ProgrammingLanguage,
  normalizePackages
} from '../../utils/code-parser';

describe('Code Parser', () => {
  describe('Language Detection', () => {
    test('detects JavaScript from file extension', () => {
      expect(detectLanguageFromExtension('app.js')).toBe(ProgrammingLanguage.JAVASCRIPT);
      expect(detectLanguageFromExtension('component.jsx')).toBe(ProgrammingLanguage.JAVASCRIPT);
    });

    test('detects TypeScript from file extension', () => {
      expect(detectLanguageFromExtension('service.ts')).toBe(ProgrammingLanguage.TYPESCRIPT);
      expect(detectLanguageFromExtension('component.tsx')).toBe(ProgrammingLanguage.TYPESCRIPT);
    });

    test('detects Python from file extension', () => {
      expect(detectLanguageFromExtension('script.py')).toBe(ProgrammingLanguage.PYTHON);
    });

    test('detects other languages from file extension', () => {
      expect(detectLanguageFromExtension('Main.java')).toBe(ProgrammingLanguage.JAVA);
      expect(detectLanguageFromExtension('script.rb')).toBe(ProgrammingLanguage.RUBY);
      expect(detectLanguageFromExtension('index.php')).toBe(ProgrammingLanguage.PHP);
      expect(detectLanguageFromExtension('main.go')).toBe(ProgrammingLanguage.GO);
      expect(detectLanguageFromExtension('lib.rs')).toBe(ProgrammingLanguage.RUST);
    });

    test('returns UNKNOWN for unsupported extensions', () => {
      expect(detectLanguageFromExtension('document.txt')).toBe(ProgrammingLanguage.UNKNOWN);
      expect(detectLanguageFromExtension('index.html')).toBe(ProgrammingLanguage.UNKNOWN);
    });

    test('detects JavaScript from content', () => {
      const jsCode = `
        import React from 'react';
        const App = () => <div>Hello World</div>;
        export default App;
      `;
      expect(detectLanguageFromContent(jsCode)).toBe(ProgrammingLanguage.JAVASCRIPT);
    });

    test('detects TypeScript from content', () => {
      const tsCode = `
        import { Component } from '@angular/core';
        interface User { id: string; name: string; }
        export class UserService {
          getUser(): User { return { id: '1', name: 'John' }; }
        }
      `;
      expect(detectLanguageFromContent(tsCode)).toBe(ProgrammingLanguage.TYPESCRIPT);
    });

    test('detects Python from content', () => {
      const pyCode = `
        import os
        import sys
        
        def main():
            print("Hello World")
            
        if __name__ == "__main__":
            main()
            
        # This is a Python comment
        x = [1, 2, 3]
        for i in x:
            print(i)
      `;
      expect(detectLanguageFromContent(pyCode)).toBe(ProgrammingLanguage.PYTHON);
    });
  });

  describe('Package Detection', () => {
    test('detects JavaScript packages', () => {
      const jsCode = `
        import React from 'react';
        import { useState, useEffect } from 'react';
        import axios from 'axios';
        import * as lodash from 'lodash';
        const fs = require('fs');
        
        // Dynamic import
        const module = await import('module-name');
      `;
      
      const packages = getPackagesFromCode(jsCode, 'app.js');
      expect(packages).toContain('react');
      expect(packages).toContain('axios');
      expect(packages).toContain('lodash');
      expect(packages).toContain('module-name');
      // fs should be filtered out as standard library
      expect(packages).not.toContain('fs');
    });

    test('detects TypeScript packages with scoped packages', () => {
      const tsCode = `
        import { Injectable } from '@angular/core';
        import { HttpClient } from '@angular/common/http';
        import * as moment from 'moment';
        
        @Injectable()
        export class DataService {
          constructor(private http: HttpClient) {}
        }
      `;
      
      const packages = getPackagesFromCode(tsCode, 'service.ts');
      // Our improved code now preserves the scoped package names
      expect(packages).toContain('@angular/core');
      expect(packages).toContain('@angular/common');
      expect(packages).toContain('moment');
    });

    test('detects Python packages', () => {
      const pyCode = `
        import numpy as np
        import pandas as pd
        from tensorflow import keras
        from os import path
        import sys
      `;
      
      const packages = getPackagesFromCode(pyCode, 'script.py');
      expect(packages).toContain('numpy');
      expect(packages).toContain('pandas');
      expect(packages).toContain('tensorflow');
      // os and sys should be filtered out as standard libraries
      expect(packages).not.toContain('os');
      expect(packages).not.toContain('sys');
    });

    test('detects Java packages', () => {
      const javaCode = `
        import java.util.List;
        import java.util.ArrayList;
        import org.springframework.boot.SpringApplication;
        import com.google.gson.Gson;
      `;
      
      const packages = getPackagesFromCode(javaCode, 'App.java');
      // java.util should be filtered as standard library
      expect(packages).not.toContain('java.util');
      expect(packages).toContain('org.springframework');
      expect(packages).toContain('com.google');
    });

    test('detects Ruby packages', () => {
      const rubyCode = `
        require 'rails'
        require 'active_record'
        require_relative './custom_module'
      `;
      
      const packages = getPackagesFromCode(rubyCode, 'app.rb');
      expect(packages).toContain('rails');
      expect(packages).toContain('active_record');
      // relative imports should be excluded
      expect(packages).not.toContain('./custom_module');
    });

    test('ignores commented imports', () => {
      const mixedCode = `
        import react from 'react';
        // import moment from 'moment';
        
        /*
        import lodash from 'lodash';
        */
        
        const unused = 'not an import';
      `;
      
      const packages = getPackagesFromCode(mixedCode, 'app.js');
      expect(packages).toContain('react');
      expect(packages).not.toContain('moment');
      expect(packages).not.toContain('lodash');
    });
  });

  describe('normalizePackages', () => {
    test('deduplicates packages', () => {
      const packages = [
        { name: 'react', language: ProgrammingLanguage.JAVASCRIPT, importStatement: "import React from 'react'" },
        { name: 'react', language: ProgrammingLanguage.JAVASCRIPT, importStatement: "import { useState } from 'react'" }
      ];
      
      const normalized = normalizePackages(packages);
      expect(normalized.length).toBe(1);
      expect(normalized[0].name).toBe('react');
    });

    test('filters standard libraries', () => {
      const packages = [
        { name: 'react', language: ProgrammingLanguage.JAVASCRIPT, importStatement: "import React from 'react'" },
        { name: 'fs', language: ProgrammingLanguage.JAVASCRIPT, importStatement: "import fs from 'fs'" },
        { name: 'os', language: ProgrammingLanguage.PYTHON, importStatement: "import os" }
      ];
      
      const normalized = normalizePackages(packages);
      expect(normalized.length).toBe(1);
      expect(normalized[0].name).toBe('react');
    });
  });
}); 