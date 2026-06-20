import express from "express";
import { PrismaClient } from "@prisma/client";
import { logEvent } from "./services/auditService";

const prisma = new PrismaClient();
const router = express.Router();

// Example: create membership
router.post("/members", async (req, res) => {
  const { walletId, communityId, role } = req.body;
  try {
    const before = null;
    const created = await prisma.member.create({
      data: { walletId, communityId, role },
    });

    // Audit log
    try {
      await logEvent({
        eventType: "MEMBERSHIP_CREATED",
        walletId,
        communityId,
        resource: "member",
        policyRule: null,
        decision: "CREATED",
        reasonCode: null,
        beforeState: before,
        afterState: created,
      });
    } catch (err) {
      console.error("Failed to log membership created event:", err);
    }

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: "Failed to create member" });
  }
});

// Example: update membership
router.put("/members/:id", async (req, res) => {
  const id = req.params.id;
  const updates = req.body;
  try {
    const before = await prisma.member.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ error: "Member not found" });

    const updated = await prisma.member.update({
      where: { id },
      data: updates,
    });

    // Audit log
    try {
      await logEvent({
        eventType: "MEMBERSHIP_UPDATED",
        walletId: updated.walletId ?? null,
        communityId: updated.communityId ?? null,
        resource: "member",
        policyRule: null,
        decision: "UPDATED",
        reasonCode: null,
        beforeState: before,
        afterState: updated,
      });
    } catch (err) {
      console.error("Failed to log membership updated event:", err);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update member" });
  }
});

// Example: delete membership
router.delete("/members/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const before = await prisma.member.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ error: "Member not found" });

    await prisma.member.delete({ where: { id } });

    // Audit log
    try {
      await logEvent({
        eventType: "MEMBERSHIP_DELETED",
        walletId: before.walletId ?? null,
        communityId: before.communityId ?? null,
        resource: "member",
        policyRule: null,
        decision: "DELETED",
        reasonCode: null,
        beforeState: before,
        afterState: null,
      });
    } catch (err) {
      console.error("Failed to log membership deleted event:", err);
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete member" });
  }
});

export default router;
