#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const VALID_TYPES = ['patch', 'minor', 'major', 'prerelease'];

function execCommand(command, options = {}) {
  try {
    return execSync(command, { 
      stdio: 'inherit', 
      encoding: 'utf8',
      ...options 
    });
  } catch {
    console.error(`❌ Command failed: ${command}`);
    process.exit(1);
  }
}

function updateVersion(type, preid = 'beta') {
  console.log(`🔄 Bumping version: ${type}`);
  
  // Bump version in all packages
  const versionCommand = type === 'prerelease' 
    ? `npm version ${type} --preid=${preid} --workspaces --no-git-tag-version`
    : `npm version ${type} --workspaces --no-git-tag-version`;
  
  execCommand(versionCommand);
  
  // Get the new version
  const protocolPkg = JSON.parse(readFileSync('./packages/protocol/package.json', 'utf8'));
  const newVersion = protocolPkg.version;
  
  console.log(`✅ Version bumped to: ${newVersion}`);
  return newVersion;
}

function createGitTag(version) {
  console.log(`🏷️  Creating git tag: v${version}`);
  
  execCommand('git add .');
  execCommand(`git commit -m "chore: bump version to ${version}"`);
  execCommand(`git tag v${version}`);
  
  console.log(`✅ Created tag v${version}`);
}

function pushToGit(version) {
  console.log(`🚀 Pushing to git...`);
  
  execCommand('git push origin main');
  execCommand(`git push origin v${version}`);
  
  console.log(`✅ Pushed version ${version} to git`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: npm run release <type> [prerelease-id]

Types:
  patch      - 0.1.0 → 0.1.1
  minor      - 0.1.0 → 0.2.0  
  major      - 0.1.0 → 1.0.0
  prerelease - 0.1.0 → 0.1.1-beta.0

Examples:
  npm run release patch
  npm run release minor
  npm run release prerelease
  npm run release prerelease alpha
`);
    process.exit(1);
  }
  
  const [type, preid] = args;
  
  if (!VALID_TYPES.includes(type)) {
    console.error(`❌ Invalid version type: ${type}`);
    console.error(`Valid types: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }
  
  // Check if working directory is clean
  try {
    execCommand('git diff-index --quiet HEAD --', { stdio: 'pipe' });
  } catch {
    console.error('❌ Working directory is not clean. Please commit your changes first.');
    process.exit(1);
  }
  
  // Run tests
  console.log('🧪 Running tests...');
  execCommand('npm test');
  
  // Build packages
  console.log('🔨 Building packages...');
  execCommand('npm run build');
  
  // Update versions
  const newVersion = updateVersion(type, preid);
  
  // Create git tag and push
  createGitTag(newVersion);
  pushToGit(newVersion);
  
  console.log(`
🎉 Release ${newVersion} completed!

The GitHub Action will automatically publish to npm when the tag is pushed.
Check the Actions tab: https://github.com/YOUR_USERNAME/hmjs/actions
`);
}

main();