const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Import and run table creation on startup
const { createUsersTable } = require("./models/User");
const { createStudentsTable } = require("./models/Student");
const { createParentsTable } = require("./models/Parent");

(async () => {
  await createUsersTable();
  await createStudentsTable();
  await createParentsTable();
})();

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));

// Health check
app.get("/", (req, res) => res.send("RoyalChan backend is running ✅"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
