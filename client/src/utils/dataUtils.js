import axios from "axios";
//PORT for backend images
export const PORT = `http://localhost:3000/`;
//GET all products
export const getProducts = () => axios.get(`/products`);
//GET all users
export const getUser = () => axios.get(`/users`);
//GET single user
export const getSingleUser = (username) => axios.get(`/users/${username}`);
//POST Login User
export const loginUser = (userData) => axios.post("/users/login", userData);
//POST Create new user/sign-up
export const signUpNewUser = (userData) =>
  axios.post("/users/signup", userData);

//User adds products they are NOT sensitive:
export const addNotSensitiveProduct = (username, product) =>
  axios.patch(`/users/${username}`, product);
//User Adds products they are sensitive to:
export const addSensitiveToProduct = (username, product) =>
  axios.patch(`/users/sensitive/${username}`, product);

//User can delete a product from their YesSensitivity List:
export const deleteProductSensitiveTo = (username) =>
  axios.delete(`/users/sensitive/${username}`);
