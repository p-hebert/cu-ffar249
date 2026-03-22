const maxAPI = require("max-api");

maxAPI.addHandler("give_number", () => {
  maxAPI.outlet(42);
});
