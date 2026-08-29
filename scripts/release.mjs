#!/usr/bin/env node
// Compila a build release do Tauri (sem gerar MSI/NSIS) e substitui o executável
// permanente na raiz do projeto: "Cofre de Contas.exe".
//
// Uso: npm run release

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcTauriDir = path.join(projectRoot, 'src-tauri');
const finalExeName = 'Cofre de Contas.exe';
const finalExePath = path.join(projectRoot, finalExeName);

function readTargetDir() {
  const cargoConfigPath = path.join(srcTauriDir, '.cargo', 'config.toml');
  const defaultTargetDir = path.join(srcTauriDir, 'target');
  if (!fs.existsSync(cargoConfigPath)) return defaultTargetDir;
  const content = fs.readFileSync(cargoConfigPath, 'utf8');
  const match = content.match(/target-dir\s*=\s*"([^"]+)"/);
  if (!match) return defaultTargetDir;
  return path.resolve(srcTauriDir, match[1]);
}

function readBinName() {
  const cargoTomlPath = path.join(srcTauriDir, 'Cargo.toml');
  const content = fs.readFileSync(cargoTomlPath, 'utf8');
  const match = content.match(/^\[package\][\s\S]*?^name\s*=\s*"([^"]+)"/m);
  return match ? match[1] : 'app';
}

function run(commandLine) {
  console.log(`\n> ${commandLine}`);
  execSync(commandLine, { stdio: 'inherit', cwd: projectRoot });
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log('Compilando build release do Cofre de Contas (sem instaladores MSI/NSIS)...');
run(`${npxCommand} tauri build --no-bundle`);

const targetDir = readTargetDir();
const binName = readBinName();
const compiledExePath = path.join(targetDir, 'release', `${binName}.exe`);

if (!fs.existsSync(compiledExePath)) {
  console.error(`\nErro: executável compilado não encontrado em:\n${compiledExePath}`);
  console.error('O build pode ter falhado antes de gerar o binário. O .exe anterior na raiz não foi alterado.');
  process.exit(1);
}

const tempPath = path.join(projectRoot, `.${finalExeName}.tmp`);

try {
  fs.copyFileSync(compiledExePath, tempPath);
  // rename é uma substituição atômica no mesmo volume: ou troca o arquivo inteiro,
  // ou falha sem tocar no .exe anterior (nunca deixa a raiz com um arquivo parcial).
  fs.renameSync(tempPath, finalExePath);
} catch (err) {
  try { fs.rmSync(tempPath, { force: true }); } catch { /* melhor esforço */ }

  if (err.code === 'EBUSY' || err.code === 'EPERM') {
    console.error(`\nNão foi possível atualizar "${finalExeName}" porque o arquivo está em uso.`);
    console.error('Feche o aplicativo Cofre de Contas e execute "npm run release" novamente.');
    console.error('O executável anterior continua intacto e funcional.');
    process.exit(1);
  }
  throw err;
}

console.log(`\n${finalExeName} atualizado com sucesso.`);
console.log(finalExePath);
