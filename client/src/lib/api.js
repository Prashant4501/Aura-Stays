import axios from 'axios';

let inMemoryToken = null;
let logoutCallback = null;

export const setAccessToken = (token) => {
  inMemoryToken = token;
};

export const getAccessToken = () => inMemoryToken;

export const registerLogoutCallback = (cb) => {
  logoutCallback = cb;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach in-memory access token
api.interceptors.request.use(
  (config) => {
    if (inMemoryToken) {
      config.headers.Authorization = `Bearer ${inMemoryToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle silent refresh & friendly error mapping
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized for silent refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes('/auth/login') &&
      !originalRequest.url.includes('/auth/refresh') &&
      !originalRequest.url.includes('/auth/register')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = refreshResponse.data?.accessToken;
        if (newAccessToken) {
          setAccessToken(newAccessToken);
          processQueue(null, newAccessToken);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        }
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        setAccessToken(null);
        if (logoutCallback) {
          logoutCallback();
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Extracts a user-friendly error message from Axios errors.
 * Specifically handles 409 conflict: "These dates were just booked, please pick other dates".
 */
export function getErrorMessage(error, defaultMessage = 'An unexpected error occurred') {
  if (!error) return defaultMessage;

  if (error.response) {
    const status = error.response.status;
    const errData = error.response.data?.error;

    if (status === 409) {
      if (errData?.code === 'ROOM_ALREADY_BOOKED' || errData?.code === 'ROOM_HAS_RESERVATION') {
        return 'These dates were just booked, please pick other dates.';
      }
      return errData?.message || 'A conflicting reservation already exists. Please choose alternate dates.';
    }

    if (errData?.message) {
      if (errData?.details && Array.isArray(errData.details) && errData.details.length > 0) {
        return errData.details.map((d) => d.message).join('. ');
      }
      return errData.message;
    }

    if (typeof error.response.data === 'string') {
      return error.response.data;
    }
  }

  return error.message || defaultMessage;
}

export default api;
