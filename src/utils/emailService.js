import nodemailer from 'nodemailer';
import { CONFIG } from '../config/appConfig.js';

// Utility function for creating email transporter
export const createTransporter = () => {
  return nodemailer.createTransport(CONFIG.email);
};

export const updateEmailConfig = newConfig => {
  Object.assign(CONFIG.urls, newConfig);
};

export { CONFIG };
