/**
 * Human-readable descriptions of release rules, for the entry editor and
 * (redacted) steward views. Pure; safe to import anywhere.
 */

export interface DescribableRule {
  targetType: "IMMEDIATE" | "SPECIFIC_MEMBER" | "ROLE";
  targetMemberId: string | null;
  targetRole:
    | "CHILD"
    | "GRANDCHILD"
    | "GREAT_GRANDCHILD"
    | "ANY_DESCENDANT"
    | "ALL_FAMILY"
    | null;
  triggerType: "NONE" | "AGE" | "DATE" | "EVENT";
  triggerAge: number | null;
  triggerDate: Date | null;
  triggerEvent:
    | "MARRIAGE"
    | "GRADUATION"
    | "BIRTH_OF_FIRST_CHILD"
    | "DEATH_OF_AUTHOR"
    | "CUSTOM"
    | null;
  triggerEventLabel: string | null;
}

const ROLE_TEXT: Record<string, string> = {
  CHILD: "any child of the author",
  GRANDCHILD: "any grandchild of the author",
  GREAT_GRANDCHILD: "any great-grandchild of the author",
  ANY_DESCENDANT: "any descendant of the author",
  ALL_FAMILY: "the whole family",
};

const EVENT_TEXT: Record<string, string> = {
  MARRIAGE: "they marry",
  GRADUATION: "they graduate",
  BIRTH_OF_FIRST_CHILD: "their first child is born",
  DEATH_OF_AUTHOR: "the author dies",
  CUSTOM: "a milestone is reached",
};

function targetText(rule: DescribableRule, nameFor: (id: string) => string): string {
  switch (rule.targetType) {
    case "IMMEDIATE":
      return "Everyone in the family";
    case "SPECIFIC_MEMBER":
      return rule.targetMemberId ? nameFor(rule.targetMemberId) : "a specific person";
    case "ROLE":
      return rule.targetRole ? capitalize(ROLE_TEXT[rule.targetRole]) : "a group";
    default:
      return "someone";
  }
}

function triggerText(rule: DescribableRule): string {
  switch (rule.triggerType) {
    case "NONE":
      return "as soon as it is published";
    case "AGE":
      return `when they turn ${rule.triggerAge ?? "?"}`;
    case "DATE":
      return rule.triggerDate
        ? `on ${rule.triggerDate.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}`
        : "on a date";
    case "EVENT":
      if (rule.triggerEvent === "CUSTOM" && rule.triggerEventLabel) {
        return `when ${rule.triggerEventLabel}`;
      }
      return `when ${EVENT_TEXT[rule.triggerEvent ?? "CUSTOM"] ?? "an event happens"}`;
    default:
      return "";
  }
}

export function describeRule(
  rule: DescribableRule,
  nameFor: (id: string) => string = () => "a specific person",
): string {
  return `${targetText(rule, nameFor)} — ${triggerText(rule)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
