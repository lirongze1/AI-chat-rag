import { Router } from "express";
import * as adminController from "../controllers/admin.controller";
import { requireAdmin, requireAuth } from "../middleware/auth";

/** All admin endpoints require a valid token and an active ADMIN account. */
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/users", adminController.listUsers);
adminRouter.post("/users", adminController.createUser);
adminRouter.patch("/users/:userId", adminController.updateUser);
adminRouter.post("/users/:userId/reset-password", adminController.resetPassword);
adminRouter.delete("/users/:userId", adminController.deleteUser);

adminRouter.get("/config", adminController.getConfig);
adminRouter.put("/config", adminController.putConfig);
adminRouter.post("/config/test", adminController.testConfig);

export default adminRouter;
