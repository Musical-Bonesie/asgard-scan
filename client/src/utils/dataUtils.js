import axios from "axios";

//Product calls
export const getProducts = () => axios.get(`/products`);
export const getUser = () => axios.get(`/users`);

//addYesProducts adds products that user is NOT sensitive and id is usersID
export const addYesProduct = (user, product) =>
  axios.patch(`/users/notsensitive/${user.id}`, product);
//TODO make sure to test that this API call works
