import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;

export async function hashPassword(plainPassword, saltRounds = 10) {
  try {
    return await bcrypt.hash(plainPassword, saltRounds);
  } catch (err) {
    console.error('Greška u hashiranju lozinke:', err);
    return null;
  }
}

export async function checkPassword(plainPassword, hashedPassword) {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (err) {
    console.error('Greška u provjeri lozinke:', err);
    return false;
  }
}

export function generateJWT(payload) {
  try {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  } catch (err) {
    console.error('Greška u generiranju tokena:', err);
    return null;
  }
}

export function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.error('Token nije valjan:', err);
    return null;
  }
}