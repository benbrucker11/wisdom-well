"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import {
  acceptSuccession,
  addSuccessor,
  assumeStewardship,
  declineTransfer,
  moveSuccessor,
  removeSuccessor,
  setSuccessionPolicy,
} from "@/lib/succession";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Run a succession mutation, surfacing its error message back to the page. */
async function withError(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "something went wrong";
    redirect(`/steward?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/steward");
}

export async function addSuccessorAction(formData: FormData) {
  const { member } = await requireMember();
  await withError(() =>
    addSuccessor({
      familyId: member.familyId,
      actingMemberId: member.id,
      memberId: str(formData, "memberId"),
    }),
  );
}

export async function removeSuccessorAction(formData: FormData) {
  const { member } = await requireMember();
  await withError(() =>
    removeSuccessor({
      familyId: member.familyId,
      actingMemberId: member.id,
      successorId: str(formData, "successorId"),
    }),
  );
}

export async function moveSuccessorAction(formData: FormData) {
  const { member } = await requireMember();
  const direction = str(formData, "direction") === "up" ? "up" : "down";
  await withError(() =>
    moveSuccessor({
      familyId: member.familyId,
      actingMemberId: member.id,
      successorId: str(formData, "successorId"),
      direction,
    }),
  );
}

export async function declineTransferAction() {
  const { member } = await requireMember();
  await withError(() =>
    declineTransfer({ familyId: member.familyId, actingMemberId: member.id }),
  );
}

export async function assumeStewardshipAction() {
  const { member } = await requireMember();
  await withError(() =>
    assumeStewardship({ familyId: member.familyId, actingMemberId: member.id }),
  );
}

export async function acceptSuccessionAction() {
  const { member } = await requireMember();
  await withError(() =>
    acceptSuccession({ familyId: member.familyId, actingMemberId: member.id }),
  );
}

export async function setSuccessionPolicyAction(formData: FormData) {
  const { member } = await requireMember();
  const policy =
    str(formData, "policy") === "NAMED_ONLY"
      ? "NAMED_ONLY"
      : "NAMED_THEN_ELDEST_DESCENDANT";
  await withError(() =>
    setSuccessionPolicy({
      familyId: member.familyId,
      actingMemberId: member.id,
      policy,
    }),
  );
}
