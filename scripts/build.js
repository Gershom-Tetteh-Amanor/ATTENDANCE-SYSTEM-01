/* scripts/build.js - Production build script */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Building UG QR Attendance System...\n');

const envProdPath = path.join(__dirname, '..', '.env.production');
if (!fs.existsSync(envProdPath)) {
  console.error('❌ .env.production file not found!');
  process.exit(1);
}

fs.copyFileSync(envProdPath, path.join(__dirname, '..', '.env'));
console.log('✓ Using production environment variables');

try {
  execSync('npx vite build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log('\n✅ Build complete!');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}

fs.unlinkSync(path.join(__dirname, '..', '.env'));
console.log('✓ Cleaned up temporary files');

console.log('\n📁 Output directory: dist/');
