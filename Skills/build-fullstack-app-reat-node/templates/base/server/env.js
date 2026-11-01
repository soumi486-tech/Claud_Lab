// Loads .env (if present) before any other module reads process.env.
// Done in code rather than with `node --env-file` because watch mode treats the
// env file as a watched file, which causes restart loops on Windows.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
