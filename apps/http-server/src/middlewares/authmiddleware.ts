import { NextFunction, Request, Response } from "express";
import { errorResponse } from "../utils/error";
import jwt from "jsonwebtoken";

// export interface AuthRequest extends Request {
//     userId?: string
// }

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const authHeader = req.headers["authorization"];


        if (!authHeader || !authHeader.startsWith('Bearer ')) return errorResponse(res, 401, "You're not authorized...")

        const token = authHeader.split(' ')[1];

        if (!token) return errorResponse(res, 401, "You're not authorized...")

        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as { userId: string }

        if (!decoded.userId) return errorResponse(res, 401, "You're not authorized...")

        req.userId = decoded.userId;
        next();

    } catch (error) {
        // Expired, malformed or badly signed token: the client needs a 401 to log the user out.
        if (error instanceof jwt.JsonWebTokenError) return errorResponse(res, 401, "You're not authorized...")

        console.log("Error in authentication", error);
        return errorResponse(res, 500, "Internal Server Error...")
    }
}

/**
 * Attach req.userId when a valid token is present, and carry on when it is not.
 *
 * Joining a quiz is open to anyone — no account needed, which is the point of
 * a join code — so the route cannot require auth. But it still needs to know
 * who a signed-in participant is: without that the Participant row is written
 * with userId null and the player never sees the quiz in their history,
 * because nothing links the two.
 *
 * A bad or expired token is treated as no token rather than an error. Someone
 * with a stale token in their browser should still be able to play.
 */
export const optionalAuthMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as { userId: string };
        req.userId = decoded.userId;
    } catch {
        // Expired or malformed: continue as an anonymous participant.
    }

    next();
}
