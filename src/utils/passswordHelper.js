import crypto from 'crypto';
import { originalKey } from './constants.js';

const key = crypto.scryptSync(originalKey, 'salt', 24);
export const encryptPassword = password => {
  try {
    const iv = Buffer.alloc(8, 0); // TripleDES uses 8-byte IV
    const cipher = crypto.createCipheriv('des-ede3-cbc', key, iv);
    let encrypted = cipher.update(password, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  } catch (ex) {
    throw new Error('Error in encryption: ' + ex.message);
  }
};

export const decryptPassword = encryptedPassword => {
  try {
    const iv = Buffer.alloc(8, 0); // TripleDES uses 8-byte IV
    const decipher = crypto.createDecipheriv('des-ede3-cbc', key, iv);
    let decrypted = decipher.update(encryptedPassword, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (ex) {
    throw new Error('Error in decryption: ' + ex.message);
  }
};
