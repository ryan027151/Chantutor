const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Tables are managed directly in the Supabase dashboard.
// See backend/models/ for the SQL to paste into Supabase's SQL Editor.

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));

// Health check
app.get("/", (req, res) => res.send("RoyalChan backend is running ✅"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
