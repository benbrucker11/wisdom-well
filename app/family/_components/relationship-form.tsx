"use client";

import { useState } from "react";

type RelType = "PARENT_OF" | "CHILD_OF" | "SPOUSE_OF" | "SIBLING_OF" | "CUSTOM";

/**
 * "Record a relationship" — a client component only so the parent-type and
 * custom-label fields appear when they apply. Submits to the `addRelationship`
 * server action passed in.
 */
export function RelationshipForm({
  action,
  members,
  defaultFromId,
}: {
  action: (formData: FormData) => Promise<void>;
  members: { id: string; name: string }[];
  defaultFromId?: string;
}) {
  const [type, setType] = useState<RelType>("PARENT_OF");
  const showParentKind = type === "PARENT_OF" || type === "CHILD_OF";

  return (
    <form action={action} className="mt-4 space-y-3">
      <select
        name="fromMemberId"
        required
        defaultValue={defaultFromId ?? ""}
        className="field"
        aria-label="First person"
      >
        <option value="" disabled>
          Choose a person&hellip;
        </option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        name="type"
        required
        value={type}
        onChange={(e) => setType(e.target.value as RelType)}
        className="field"
        aria-label="Relationship"
      >
        <option value="PARENT_OF">is a parent of</option>
        <option value="CHILD_OF">is a child of</option>
        <option value="SPOUSE_OF">is married to</option>
        <option value="SIBLING_OF">is a sibling of</option>
        <option value="CUSTOM">something else (custom)&hellip;</option>
      </select>

      {showParentKind ? (
        <select
          name="parentKind"
          defaultValue="BIOLOGICAL"
          className="field text-sm"
          aria-label="Parent type"
        >
          <option value="BIOLOGICAL">— parent type: biological</option>
          <option value="ADOPTIVE">— parent type: adoptive</option>
          <option value="STEP">— parent type: step</option>
          <option value="GUARDIAN">— parent type: guardian</option>
        </select>
      ) : null}

      {type === "CUSTOM" ? (
        <label className="block text-sm text-ink-soft">
          The first person is the second person&rsquo;s&hellip;
          <input
            name="customLabel"
            required
            maxLength={40}
            placeholder="e.g. godfather, like a sister, family friend"
            className="field mt-1"
          />
        </label>
      ) : null}

      <select
        name="toMemberId"
        required
        defaultValue=""
        className="field"
        aria-label="Second person"
      >
        <option value="" disabled>
          Choose a person&hellip;
        </option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <button type="submit" className="btn btn-primary">
        Record
      </button>

      <p className="text-sm text-ink-soft">
        {type === "CUSTOM" ? (
          <>
            Custom relationships are shown on the tree as a dotted line. They
            describe the bond only &mdash; they never count as lineage, never
            decide who receives wisdom, and never affect stewardship.
          </>
        ) : (
          <>
            Only record <strong>parent / child</strong> links for lineage
            &mdash; grandparent, cousin, and descendant are worked out
            automatically. Adoptive parents count as full lineage; step and
            guardian are held separately and can be excluded per release rule.
          </>
        )}
      </p>
    </form>
  );
}
