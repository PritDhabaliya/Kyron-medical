import { Router } from "express";
import { chatController } from "../controllers/chatController";
import { doctorsController } from "../controllers/doctorsController";
import { availabilityController } from "../controllers/availabilityController";
import { patientController } from "../controllers/patientController";
import { appointmentController } from "../controllers/appointmentController";

export const apiRouter = Router();

apiRouter.get("/chat", (_req, res) => {
  res.status(405).json({
    error: "Use POST /api/chat with { user_message, session_id }",
  });
});
apiRouter.post("/chat", chatController);
apiRouter.post("/patient", patientController);
apiRouter.get("/doctors", doctorsController);
apiRouter.get("/availability", availabilityController);
apiRouter.post("/appointment", appointmentController);

