import { GoogleCloudCodeAuth } from 'cloud-code-ai-provider';

async function runAuth() {
  try {
    // Check for command line flags
    const force = process.argv.includes('--force');
    const dirIndex = process.argv.indexOf('--dir');
    const credentialDirectory = dirIndex > -1 && process.argv[dirIndex + 1] ? process.argv[dirIndex + 1] : undefined;
    
    // Show usage info
    if (process.argv.includes('--help')) {
      console.log('Usage: npm run auth [options]');
      console.log('\nOptions:');
      console.log('  --force          Force re-authentication even if already authenticated');
      console.log('  --dir <path>     Use custom directory for storing credentials');
      console.log('  --help           Show this help message');
      console.log('\nExamples:');
      console.log('  npm run auth');
      console.log('  npm run auth -- --force');
      console.log('  npm run auth -- --dir .myapp/creds');
      process.exit(0);
    }
    
    // Run the built-in authentication flow
    await GoogleCloudCodeAuth.authenticate({ 
      force,
      credentialDirectory
    });
    
    // Show user info
    if (await GoogleCloudCodeAuth.isAuthenticated()) {
      try {
        const userInfo = await GoogleCloudCodeAuth.getUserInfo();
        if (userInfo.email) {
          console.log(`👤 Authenticated as: ${userInfo.email}`);
        }
      } catch {
        // User info might not be available, that's okay
      }
    }
    
    console.log('🎉 You can now run "npm start" to use the examples!');
  } catch (error) {
    console.error('Authentication failed:', error);
    process.exit(1);
  }
}

// Run authentication
runAuth();