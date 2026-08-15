// Entry point. All app wiring lives in app.js so the app can be imported by
// tests without binding a port.
const app = require("./app");

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server is now running on port ${PORT}`);
});
