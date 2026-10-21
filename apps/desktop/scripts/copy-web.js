// Copies the built web app (../web/dist) into this shell so electron-builder packages the SAME code the browser runs.
const fs = require('fs'); const path = require('path')
const src = path.join(__dirname, '..', '..', 'web', 'dist'); const dst = path.join(__dirname, '..', 'dist-web')
if (!fs.existsSync(src)) { console.error('Build the web app first: npm run build:web'); process.exit(1) }
fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true })
console.log('Copied web build to dist-web')
