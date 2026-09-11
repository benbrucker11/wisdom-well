"use client";

import { useState } from "react";
import { addRule } from "../actions";

type TargetType = "IMMEDIATE" | "SPECIFIC_MEMBER" | "ROLE";
type TriggerType = "NONE" | "AGE" | "DATE" | "EVENT";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "CHILD", label: "any child" },
  { value: "GRANDCHILD", label: "any grandchild" },
  { value: "GREAT_GRANDCHILD", label: "any great-grandchild" },
  { value: "ANY_DESCENDANT", label: "any descendant" },
  { value: "ALL_FAMILY", label: "the whole family" },
];

const EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: "MARRIAGE", label: "they marry" },
  { value: "GRADUATION", label: "they graduate" },
  { value: "BIRTH_OF_FIRST_CHILD", label: "their first child is born" },
  { value: "DEATH_OF_AUTHOR", label: "the author dies" },
  { value: "CUSTOM", label: "a custom milestone" },
];

const field = "field";

export function RuleBuilder({
  entryId,
  members,
}: {
  entryId: string;
  members: { id: string; name: string }[];
}) {
  const [target, setTarget] = useState<TargetType>("IMMEDIATE");
  const [role, setRole] = useState<string>("");
  const [trigger, setTrigger] = useState<TriggerType>("NONE");
  const [event, setEvent] = useState<string>("MARRIAGE");

  const isDescendantRole = ["CHILD", "GRANDCHILD", "GREAT_GRANDCHILD", "ANY_DESCENDANT"].includes(role);

  const triggerLocked = target === "IMMEDIATE";

  return (
    <form action={addRule} className="card card-muted space-y-4">
      <input type="hidden" name="entryId" value={entryId} />

      <div className="space-y-1">
        <span className="text-sm text-ink-soft">Who is this for?</span>
        <select
          name="targetType"
          value={target}
          onChange={(e) => {
            const next = e.target.value as TargetType;
            setTarget(next);
            if (next === "IMMEDIATE") setTrigger("NONE");
          }}
          className={field}
        >
          <option value="IMMEDIATE">Everyone in the family, now</option>
          <option value="SPECIFIC_MEMBER">One particular person</option>
          <option value="ROLE">A group defined by relationship</option>
        </select>
      </div>

      {target === "SPECIFIC_MEMBER" ? (
        <div className="space-y-1">
          <span className="text-sm text-ink-soft">Which person?</span>
          <select name="targetMemberId" required defaultValue="" className={field}>
            <option value="" disabled>
              Choose&hellip;
            </option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {target === "ROLE" ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <span className="text-sm text-ink-soft">Which group?</span>
            <select
              name="targetRole"
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={field}
            >
              <option value="" disabled>
                Choose&hellip;
              </option>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {isDescendantRole ? (
            <label className="flex items-start gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                name="includeStepDescendants"
                defaultChecked
                className="mt-1"
              />
              <span>
                Include step-children and their descendants. Adopted descendants
                are always included.
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1">
        <span className="text-sm text-ink-soft">When should they receive it?</span>
        <select
          name="triggerType"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as TriggerType)}
          disabled={triggerLocked}
          className={`${field} ${triggerLocked ? "opacity-50" : ""}`}
        >
          <option value="NONE">As soon as it&rsquo;s published</option>
          <option value="AGE">When they reach a certain age</option>
          <option value="DATE">On a specific date</option>
          <option value="EVENT">When a life event happens</option>
        </select>
        {triggerLocked ? (
          <p className="text-xs text-ink-soft">
            &ldquo;Everyone now&rdquo; is always immediate. For a conditional
            release to everyone, pick &ldquo;the whole family&rdquo; above.
          </p>
        ) : null}
      </div>

      {trigger === "AGE" && !triggerLocked ? (
        <label className="block space-y-1">
          <span className="text-sm text-ink-soft">Age in years</span>
          <input
            type="number"
            name="triggerAge"
            min={0}
            max={130}
            required
            defaultValue={18}
            className={field}
          />
        </label>
      ) : null}

      {trigger === "DATE" && !triggerLocked ? (
        <label className="block space-y-1">
          <span className="text-sm text-ink-soft">Date</span>
          <input type="date" name="triggerDate" required className={field} />
        </label>
      ) : null}

      {trigger === "EVENT" && !triggerLocked ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-sm text-ink-soft">Which event?</span>
            <select
              name="triggerEvent"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className={field}
            >
              {EVENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {event === "CUSTOM" ? (
            <label className="block space-y-1">
              <span className="text-sm text-ink-soft">
                Describe it (the steward will confirm when it happens)
              </span>
              <input
                type="text"
                name="triggerEventLabel"
                required
                placeholder="e.g. buys their first home"
                className={field}
              />
            </label>
          ) : null}
          <p className="text-xs text-ink-soft">
            Life events can&rsquo;t be detected automatically. Someone &mdash; the
            steward, or you while you&rsquo;re living &mdash; confirms when they
            happen.
          </p>
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary">
        Add rule
      </button>
    </form>
  );
}
