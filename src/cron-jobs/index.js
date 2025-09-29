import { startSapTransactionCronJob } from './sapTransactionProcessor.js';

// Function to initialize all cron jobs
export const initializeCronJobs = () => {
  // Start SAP Transaction processor cron job
  startSapTransactionCronJob();

  // Add more cron jobs here as needed
};

// Export any utility functions for manual triggering
export { manuallyTriggerSapProcessing } from './sapTransactionProcessor.js';
