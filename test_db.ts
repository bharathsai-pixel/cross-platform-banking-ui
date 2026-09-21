import { Sequelize } from "sequelize";
import mongoose from "mongoose";

async function run() {
  console.log("Testing MySQL...");
  const sequelize = new Sequelize({
    dialect: "mysql",
    host: "localhost",
    port: 3306,
    username: "nexuspay_app",
    password: "nexuspay_dev_password",
    database: "nexuspay",
  });
  
  try {
    await sequelize.authenticate();
    console.log("MySQL connected!");
  } catch (err) {
    console.error("MySQL error:", err);
  }

  console.log("Testing MongoDB...");
  try {
    await mongoose.connect("mongodb://localhost:27017/nexuspay", {
      serverSelectionTimeoutMS: 2000,
    });
    console.log("MongoDB connected!");
  } catch (err) {
    console.error("MongoDB error:", err);
  }
  process.exit(0);
}
run();
