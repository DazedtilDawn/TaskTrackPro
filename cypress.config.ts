import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5000',
    supportFile: false,
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    experimentalStudio: true,
    setupNodeEvents(on, config) {
      // implement node event listeners here
      // and load any plugins that require the Node environment
    },
  },
  env: {
    // Add any environment variables needed for tests
    apiUrl: 'http://localhost:5000/api',
  },
  retries: {
    runMode: 2,
    openMode: 0,
  },
}); 