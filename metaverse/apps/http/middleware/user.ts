import jwt from "jsonwebtoken";
import { JWT_ALGORITHM, JWT_PASSWORD } from "../config";
import type { NextFunction, Request, Response } from "express";
import client from "@repo/db/client";

export const userMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const header = req.headers["authorization"];
  const token = header?.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_PASSWORD, {
      algorithms: [JWT_ALGORITHM],
    }) as {
      userId: string;
    };
    req.userId = decoded.userId;
    next();
  } catch (e) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};


export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const user = await client.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });
    if (user?.role !== "Admin") {
      res.status(403).json({ message: "Admin access required" });
      return;
    }
    next();
  } catch (err) {
    req.log.error({ err }, "failed to verify admin role");
    res.status(500).json({ message: "Internal server error" });
  }
};
