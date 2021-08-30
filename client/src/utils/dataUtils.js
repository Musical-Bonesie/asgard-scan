import axios from "axios";
require("dotenv").config();
export const URL = process.env.REACT_APP_API_URL;
//PORT for backend images
export const PORT = `http://localhost:3000/`;

//GET all products
export const getProducts = () => axios.get(`${URL}/products`);
//GET all users
export const getUser = () => axios.get(`${URL}/users`);
//GET single user
export const getSingleUser = (username, token) =>
  axios.get(`${URL}/users/${username}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
//test above with token and header line 11-14
//POST Login User
export const loginUser = (userData) =>
  axios.post(`https://asgard-scan.herokuapp.com/users/login`, userData);
//POST Create new user/sign-up
export const signUpNewUser = (userData) =>
  axios.post(`${URL}/users/signup`, userData);

//User adds products they are NOT sensitive:
export const addNotSensitiveProduct = (username, product) =>
  axios.patch(`${URL}/users/${username}`, product);
//User Adds products they are sensitive to:
export const addSensitiveToProduct = (username, product) =>
  axios.patch(`${URL}/users/sensitive/${username}`, product);

//User can delete a product from their YesSensitivity List:
export const deleteProductSensitiveTo = (username) =>
  axios.delete(`${URL}/users/sensitive/${username}`);
