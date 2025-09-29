export const CONFIG = {
  email: {
    service: 'gmail',
    auth: {
      user: 'mumbai.software@bartechdata.net',
      pass: 'hsdf svlu tfzt vrlf',
    },
  },

  urls: {
    complaintTracking: 'https://complain.bartechdata.net/complaint/history',

    companyWebsite: 'https://bartechdata.net',

    logoUrl: 'https://bartechdata.net/wp-content/webp-express/webp-images/themes/bartech/images/logo.png.webp',
  },

  company: {
    name: 'Bartech Data System Pvt Ltd',
    supportEmail: 'support@bartechdata.net',
  },

  email_template: {
    priority_colors: {
      high: { bg: '#ffebee', color: '#c62828' },
      medium: { bg: '#fff3e0', color: '#ef6c00' },
      low: { bg: '#e8f5e8', color: '#2e7d32' },
    },
    warranty_colors: {
      active: { bg: '#e8f5e8', color: '#2e7d32' },
      expired: { bg: '#ffebee', color: '#c62828' },
    },
  },
};

export const updateConfig = (section, updates) => {
  if (CONFIG[section]) {
    Object.assign(CONFIG[section], updates);
  } else {
    console.warn(`Configuration section '${section}' not found`);
  }
};

export const getComplaintTrackingUrl = (serialNo, id) => {
  const baseUrl = CONFIG.urls.complaintTracking;

  const cleanSerialNo = serialNo.toString().replace(/[#%^{}[\]<>]/g, encodeURIComponent);
  const cleanId = id.toString().replace(/[#%^{}[\]<>]/g, encodeURIComponent);

  return `${baseUrl}?serialNo=${cleanSerialNo}&id=${cleanId}`;
};

export default CONFIG;
