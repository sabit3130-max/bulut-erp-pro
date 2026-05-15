const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const migrationsDir = path.join(root, 'prisma', 'migrations');
const forbiddenSql = [
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN\b/i,
  /\bDROP\s+SCHEMA\b/i,
];
const forbiddenScriptText = [
  /migrate\s+reset/i,
  /db\s+push[\s\S]*--force-reset/i,
  /--force-reset/i,
  /\btruncate\b/i,
  /\bdeleteMany\b/i,
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

for (const file of walk(migrationsDir).filter((item) => item.endsWith('.sql'))) {
  const sql = fs.readFileSync(file, 'utf8');
  const matched = forbiddenSql.find((pattern) => pattern.test(sql));
  if (matched) {
    console.error(`Canli veri koruma kilidi: yikici migration yasaklandi: ${path.relative(root, file)}`);
    process.exit(1);
  }
}

for (const packageFile of [path.join(repoRoot, 'package.json'), path.join(root, 'package.json')]) {
  if (!fs.existsSync(packageFile)) continue;
  const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  if (packageJson.prisma?.seed || packageJson.scripts?.['db:seed']) {
    console.error(`Canli veri koruma kilidi: seed scripti production paketinde bulunamaz: ${path.relative(repoRoot, packageFile)}`);
    process.exit(1);
  }
  for (const [name, script] of Object.entries(packageJson.scripts ?? {})) {
    const matched = forbiddenScriptText.find((pattern) => pattern.test(String(script)));
    if (matched) {
      console.error(`Canli veri koruma kilidi: yikici script yasaklandi (${name}) in ${path.relative(repoRoot, packageFile)}`);
      process.exit(1);
    }
  }
}

if (process.env.NODE_ENV === 'production') {
  const backupConfirmed = process.env.DB_BACKUP_CONFIRMED === 'true';
  const backupFile = process.env.DB_BACKUP_FILE;
  const backupFileExists = backupFile ? fs.existsSync(backupFile) : false;
  if (!backupConfirmed && !backupFileExists) {
    console.error('Canli veri koruma kilidi: migration icin once backup alin. DB_BACKUP_CONFIRMED=true veya DB_BACKUP_FILE=/path/backup.sql gerekli.');
    process.exit(1);
  }
}

console.log('Canli veri koruma kontrolu basarili.');
