import axios from "axios";
//PORT for backend images
export const PORT = `http://localhost:3000/`;
//GET all products
export const getProducts = () => axios.get(`/products`);
//GET all users
export const getUser = () => axios.get(`/users`);
//GET single user
export const getSingleUser = (id) => axios.get(`/users/${id}`);

//addYesProducts adds products that user is NOT sensitive and id is usersID
export const addNotSensitiveProduct = (userID, product) =>
  axios.patch(`/users/${userID}`, product);

export const addSensitiveToProduct = (userID, product) =>
  axios.patch(`/users/${userID}`, product);
//TODO make sure to test that this API call works
