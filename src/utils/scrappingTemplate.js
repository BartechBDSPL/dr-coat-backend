import nodemailer from 'nodemailer';
import { CONFIG } from '../config/appConfig.js';
import { scrappingEmailIds, frontendUrl } from './constants.js';

const createTransporter = () => {
  return nodemailer.createTransport(CONFIG.email);
};

// Scrapping Email Template Function
const createScrappingApprovalEmailTemplate = (scrappingSrNo, date) => {
  const approvalLink = `${frontendUrl}/approve-scrapping?srNo=${scrappingSrNo}&date=${date}`;
  const currentDate = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scrapping Approval Required - Gerresheimer WMS</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            background-color: #f8f9fa;
        }
        
        .email-container {
            max-width: 600px;
            margin: 20px auto;
            background: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
            overflow: hidden;
        }
        
        .header {
            background: #34495e;
            color: white;
            padding: 24px 20px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 22px;
            margin-bottom: 8px;
            font-weight: 500;
        }
        
        .header p {
            font-size: 14px;
            opacity: 0.9;
        }
        
        .content {
            padding: 24px 20px;
            color: #2c3e50;
        }
        
        .notice {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 20px;
        }
        
        .notice h2 {
            color: #495057;
            font-size: 16px;
            margin-bottom: 8px;
            font-weight: 500;
        }
        
        .notice p {
            color: #6c757d;
            font-size: 14px;
        }
        
        .scrapping-details {
            background: #ffffff;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
        }
        
        .details-grid {
            display: grid;
            gap: 12px;
        }
        
        .detail-row {
            display: flex;
            flex-wrap: wrap;
            border-bottom: 1px solid #f1f3f4;
            padding-bottom: 8px;
        }
        
        .detail-label {
            font-weight: 500;
            color: #495057;
            min-width: 140px;
            margin-bottom: 4px;
            font-size: 14px;
        }
        
        .detail-value {
            color: #2c3e50;
            flex: 1;
            font-size: 14px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        
        .approval-section {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        
        .approval-section h3 {
            color: #495057;
            margin-bottom: 12px;
            font-size: 16px;
            font-weight: 500;
        }
        
        .approval-button {
            display: inline-block;
            background: #fff;
            color: #007bff;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 500;
            font-size: 14px;
            margin: 8px 0;
            border: 2px solid #007bff;
            transition: background-color 0.2s ease, color 0.2s ease;
        }
        
        .approval-button:hover {
            background: #007bff;
            color: #fff;
        }
        
        .instructions {
            background: #ffffff;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 16px;
            margin: 20px 0;
        }
        
        .instructions h3 {
            color: #495057;
            margin-bottom: 12px;
            font-size: 14px;
            font-weight: 500;
        }
        
        .instructions ul {
            color: #6c757d;
            margin-left: 16px;
        }
        
        .instructions li {
            margin-bottom: 6px;
            font-size: 13px;
        }
        
        .info-box {
            background: #f8f9fa;
            border-left: 3px solid #6c757d;
            padding: 12px;
            margin: 16px 0;
            border-radius: 0 4px 4px 0;
        }
        
        .info-box p {
            color: #495057;
            font-size: 13px;
            margin: 0;
        }
        
        .footer {
            background: #f8f9fa;
            color: #6c757d;
            text-align: center;
            padding: 20px;
            border-top: 1px solid #e9ecef;
        }
        
        .footer p {
            margin-bottom: 6px;
            font-size: 13px;
        }
        
        .footer .company-info {
            color: #6c757d;
            font-size: 12px;
        }
        
        @media (max-width: 600px) {
            .email-container {
                margin: 10px;
                border-radius: 4px;
            }
            
            .header {
                padding: 20px 15px;
            }
            
            .content {
                padding: 20px 15px;
            }
            
            .detail-row {
                flex-direction: column;
            }
            
            .detail-label {
                min-width: auto;
            }
            
            .approval-button {
                display: block;
                width: 100%;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Scrapping Approval Required</h1>
            <p>Material Scrapping Request Awaiting Your Approval</p>
        </div>
        
        <div class="content">
            <div class="notice">
                <h2>Action Required</h2>
                <p>A scrapping request has been submitted and requires your approval to proceed.</p>
            </div>
            
            <div class="scrapping-details">
                <div class="details-grid">
                    <div class="detail-row">
                        <div class="detail-label">Scrapping Sr. No:</div>
                        <div class="detail-value">${scrappingSrNo}</div>
                    </div>
                    
                    <div class="detail-row">
                        <div class="detail-label">Request Date:</div>
                        <div class="detail-value">${date}</div>
                    </div>
                    
                    <div class="detail-row">
                        <div class="detail-label">Generated On:</div>
                        <div class="detail-value">${currentDate}</div>
                    </div>
                    
                    <div class="detail-row">
                        <div class="detail-label">Current Status:</div>
                        <div class="detail-value">
                            <span class="status-badge">Pending Approval</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="approval-section">
                <h3>Review and Approve</h3>
                <p>Click the button below to review the scrapping details and approve the request:</p>
                
                <a href="${approvalLink}" class="approval-button">
                    Review Scrapping Request
                </a>
            </div>
            
            <div class="instructions">
                <h3>Required Actions:</h3>
                <ul>
                    <li><strong>Review:</strong> Check all material details and quantities</li>
                    <li><strong>Verify:</strong> Confirm the scrapping is justified and necessary</li>
                    <li><strong>Approve:</strong> Click the approval button to authorize the scrapping</li>
                </ul>
            </div>
            
            <div class="info-box">
                <p><strong>Note:</strong> This request is waiting for your approval. Delayed approvals may impact production schedules and inventory management.</p>
            </div>
            

        </div>
        
        <div class="footer">
            <p><strong>Gerresheimer WMS System</strong></p>
            <p>Warehouse Management System</p>
            <div class="company-info">
                <p>This is an automated message from the WMS system. Please do not reply to this email.</p>
            </div>
        </div>
    </div>
</body>
</html>`;
};

// Scrapping Approval Email Sender Function
export const sendScrappingApprovalEmail = async (scrappingSrNo, date) => {
  return new Promise((resolve, reject) => {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Gerresheimer WMS System"`,
      to: scrappingEmailIds.join(','),
      cc: scrappingCcEmailIds.join(','),
      subject: `Scrapping Approval Required - Scrapping Sr. No: ${scrappingSrNo}`,
      html: createScrappingApprovalEmailTemplate(scrappingSrNo, date),
      priority: 'high',
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Scrapping approval email sending failed:', error);
        reject({ success: false, error: error.message });
      } else {
        console.log('Scrapping approval email sent successfully:', info.messageId);
        resolve({ success: true, messageId: info.messageId });
      }
    });
  });
};
