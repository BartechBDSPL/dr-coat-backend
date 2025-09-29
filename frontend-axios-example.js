// Frontend Session Management Example
// Add this to your main axios configuration file

import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: 'http://localhost:4000/api',
  timeout: 30000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor for session management
api.interceptors.response.use(
  response => {
    // Return successful responses as-is
    return response;
  },
  error => {
    const { response } = error;

    // Handle session timeout (HTTP 440)
    if (response?.status === 440) {
      console.log('🔒 Session expired:', response.data.Message);

      // Clear all stored data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.clear();

      // Show user-friendly message
      alert(`Session Expired\n\n${response.data.Message}`);

      // Redirect to login
      window.location.href = '/login';

      return Promise.reject(error);
    }

    // Handle other authentication errors (HTTP 401)
    if (response?.status === 401) {
      console.log('🚫 Authentication failed');

      // Clear tokens
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Redirect to login
      window.location.href = '/login';

      return Promise.reject(error);
    }

    // Pass through other errors
    return Promise.reject(error);
  }
);

export default api;

// Usage in your components:
// import api from './path/to/axios-config';
//
// const fetchData = async () => {
//   try {
//     const response = await api.get('/admin/all-user-master');
//     setData(response.data);
//   } catch (error) {
//     // Error will be handled by interceptor
//     console.error('API Error:', error);
//   }
// };

// For React with react-router-dom:
/*
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify'; // or your notification library

// In your main App component or axios setup:
const navigate = useNavigate();

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 440) {
      // Session expired
      localStorage.clear();
      
      toast.warning(error.response.data.Message, {
        position: "top-right",
        autoClose: 5000,
      });
      
      navigate('/login', { 
        state: { 
          message: 'Your session has expired',
          sessionExpired: true 
        }
      });
    }
    
    return Promise.reject(error);
  }
);
*/
