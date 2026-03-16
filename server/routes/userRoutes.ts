import { createUserProject, getUserCredits, getUserProject, getUserProjects, purchaseCredits, togglePublish } from "../controllers/userControllers.js";
import { protect } from "../middlewares/auth.js";
import express from "express";

const userRoutes = express.Router();

userRoutes.get("/credits", protect, getUserCredits);
userRoutes.post("/project", protect, createUserProject);
userRoutes.get("/project/:projectId", protect, getUserProject);
userRoutes.get('/projects', protect, getUserProjects)
userRoutes.get('/publish-toggle/:projectId',protect, togglePublish)
userRoutes.post('/purchase-credits',protect, purchaseCredits)


 

export default userRoutes;