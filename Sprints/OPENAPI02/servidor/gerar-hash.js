import bcrypt from 'bcryptjs';

const palavraPasse = process.argv[2];

if (!palavraPasse || palavraPasse.length < 8) {
  console.error('Uso: node gerar-hash.js <palavra-passe com pelo menos 8 caracteres>');
  process.exit(1);
}

console.log(await bcrypt.hash(palavraPasse, 10));