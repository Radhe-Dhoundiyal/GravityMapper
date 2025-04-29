// build-render.js - Custom build script for Render deployment
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Function to execute shell commands
function exec(command) {
  console.log(`Executing: ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    process.exit(1);
  }
}

// Create required directories
const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(distDir, 'public');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  console.log('Creating dist directory...');
  fs.mkdirSync(distDir, { recursive: true });
}

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  console.log('Creating dist/public directory...');
  fs.mkdirSync(publicDir, { recursive: true });
}

// Build client
console.log('Building client...');
exec('npx vite build');

// Verify client build
if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.log('Checking client build output...');
  // Try to identify where Vite is actually outputting files
  const viteOutDir = path.join(__dirname, 'client', 'dist');
  
  if (fs.existsSync(viteOutDir)) {
    console.log(`Found client build at: ${viteOutDir}, copying files...`);
    // Copy files from client/dist to dist/public
    exec(`cp -R ${viteOutDir}/* ${publicDir}/`);
  } else {
    console.error('Client build output not found! Check the Vite configuration.');
  }
}

// Build server
console.log('Building server...');
exec('npx esbuild server/index.ts server/routes.ts server/storage.ts server/vite.ts --platform=node --packages=external --bundle --format=esm --outdir=dist');

// Verify build
if (fs.existsSync(path.join(publicDir, 'index.html')) && 
    fs.existsSync(path.join(distDir, 'index.js'))) {
  console.log('Build completed successfully!');
  console.log('Directory structure:');
  exec(`ls -la ${distDir}`);
  exec(`ls -la ${publicDir}`);
} else {
  console.error('Build failed! Missing expected output files.');
  process.exit(1);
}