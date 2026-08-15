import axios from "axios";

// Vite exposes env vars on import.meta.env and requires the VITE_ prefix.
// (CRA used process.env.REACT_APP_*, which does not exist under Vite.)
export const URL = import.meta.env.VITE_API_URL;

// Base URL for product images served by the API.
export const IMAGE_BASE = `${URL}/images`;

/**
 * Shared axios instance. An interceptor attaches the session token to every
 * request, so callers no longer have to pass it by hand -- most of them
 * previously forgot, which is why the mutating endpoints were called
 * unauthenticated.
 */
const api = axios.create({ baseURL: URL });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 means the token is missing, expired, or invalid. Clear it so the
// ProtectedRoute guard sends the user back to login instead of leaving the UI
// in a half-authenticated state.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      sessionStorage.removeItem("token");
    }
    return Promise.reject(error);
  }
);

// --- Public endpoints ----------------------------------------------------

export const getProducts = () => api.get("/products");

// NOTE: there is deliberately no getUser(). `GET /users` used to return every
// user in the database, along with their skin-sensitivity records, to anyone
// who asked. It has been removed from the API.

export const loginUser = (userData) => api.post("/users/login", userData);

export const signUpNewUser = (userData) => api.post("/users/signup", userData);

// --- Authenticated endpoints ---------------------------------------------
// The token is attached by the interceptor above.

export const getSingleUser = (username) => api.get(`/users/${username}`);

export const addNotSensitiveProduct = (username, product) =>
  api.patch(`/users/${username}`, product);

export const addSensitiveToProduct = (username, product) =>
  api.patch(`/users/sensitive/${username}`, product);

/**
 * Remove one of the caller's own "sensitive to" records.
 *
 * Takes the sensitivity record's id. The old signature took a username and the
 * server deleted by `id: username`, unauthenticated and unscoped.
 */
export const deleteProductSensitiveTo = (sensitivityId) =>
  api.delete(`/users/sensitive/${sensitivityId}`);
