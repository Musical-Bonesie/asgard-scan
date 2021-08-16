import axios from "axios";

//Product calls
export const getProducts = () => axios.get(`/products`);
export const getUser = () => axios.get(`/users`);
export const addYesProduct = (product) =>
  axios.post(`/yesproducts/:userID`, product);
