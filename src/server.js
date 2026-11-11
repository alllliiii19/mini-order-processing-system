
require("dotenv").config();

const app = require("./app");

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

server.on("error", (error) => {
    console.error("Server startup error:", error.message);
    process.exit(1);
});
