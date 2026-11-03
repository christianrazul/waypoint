import { useEffect, useRef, useState } from "react";
import { draftSavers } from "./editing";

export function DraftField({
  id,
  label,
  value,
  multiline = false,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const latest = useRef(draft);
  useEffect(() => {
    if (!dirty.current) {
      latest.current = value;
      setDraft(value);
    }
  }, [value]);
  const commit = async (): Promise<boolean> => {
    while (inFlight.current) {
      if (!(await inFlight.current)) return false;
    }
    if (!dirty.current) return true;
    const submitted = latest.current;
    const saved = onSave(submitted);
    inFlight.current = saved;
    const success = await saved;
    if (inFlight.current === saved) inFlight.current = null;
    if (success && latest.current === submitted) {
      dirty.current = false;
      const normalized = multiline
        ? submitted
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join("\n")
        : submitted.trim();
      latest.current = normalized;
      setDraft(normalized);
    }
    if (success && dirty.current) return commit();
    return success;
  };
  useEffect(() => {
    draftSavers.set(id, commit);
    return () => {
      draftSavers.delete(id);
    };
  });
  const shared = {
    id,
    value: draft,
    "aria-label": label,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      latest.current = event.currentTarget.value;
      dirty.current = true;
      setDraft(latest.current);
    },
    onBlur: () => {
      void commit();
    },
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (
        event.key === "Enter" &&
        (!multiline || event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
  };
  return (
    <label className="editor-field">
      <span>{label}</span>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />}
    </label>
  );
}
