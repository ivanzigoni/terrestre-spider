export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}
