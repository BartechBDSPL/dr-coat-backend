(async function() {
    try {
      const modulePath = './dist/bundle.js';
      await import(modulePath);
      console.log('Application started successfully');
    } catch (error) {
      console.error('Failed to load the application:', error);
      process.exit(1);
    }
  })();
