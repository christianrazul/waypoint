use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Hash, PartialEq, Eq)]
struct Key {
    display: String,
    space: String,
}
struct Binding {
    generation: u64,
    key: Key,
    ready: bool,
}
struct Saved {
    generation: u64,
    snapshot: Value,
}
#[derive(Clone, Serialize)]
pub struct Snapshot {
    pub generation: u64,
    pub snapshot: Option<Value>,
}
#[derive(Default)]
pub struct Sessions {
    next: u64,
    bindings: HashMap<String, Binding>,
    issued: HashMap<u64, (String, Key)>,
    saved: HashMap<Key, Saved>,
    pub error: Option<String>,
}
impl Sessions {
    pub fn activate(&mut self, label: &str, display: &str, space: &str) -> bool {
        let key = Key {
            display: display.into(),
            space: space.into(),
        };
        if self.bindings.get(label).is_some_and(|b| b.key == key) {
            return false;
        }
        self.next += 1;
        self.issued.insert(self.next, (label.into(), key.clone()));
        self.bindings.insert(
            label.into(),
            Binding {
                generation: self.next,
                key,
                ready: false,
            },
        );
        true
    }
    pub fn suspend(&mut self, label: &str) {
        self.bindings.remove(label);
    }
    pub fn get(&self, label: &str) -> Result<Snapshot, String> {
        let binding = self.bindings.get(label).ok_or_else(|| {
            self.error
                .clone()
                .unwrap_or_else(|| "Annotation session is unavailable".into())
        })?;
        Ok(Snapshot {
            generation: binding.generation,
            snapshot: self.saved.get(&binding.key).map(|s| s.snapshot.clone()),
        })
    }
    pub fn save(&mut self, label: &str, generation: u64, snapshot: Value) -> Result<(), String> {
        let (owner, key) = self
            .issued
            .get(&generation)
            .ok_or("Unknown annotation session")?;
        if owner != label {
            return Err("Annotation session belongs to another overlay".into());
        }
        if self
            .saved
            .get(key)
            .is_some_and(|s| s.generation > generation)
        {
            return Ok(());
        }
        self.saved.insert(
            key.clone(),
            Saved {
                generation,
                snapshot,
            },
        );
        Ok(())
    }
    pub fn mark_ready(&mut self, label: &str, generation: u64) -> bool {
        if let Some(binding) = self.bindings.get_mut(label) {
            if binding.generation == generation {
                binding.ready = true;
                return true;
            }
        }
        false
    }
    pub fn is_ready(&self, label: &str) -> bool {
        self.bindings.get(label).is_some_and(|b| b.ready)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn spaces_and_displays_restore_independent_sessions() {
        let mut s = Sessions::default();
        s.activate("overlay-0", "left", "a");
        let a = s.get("overlay-0").unwrap().generation;
        s.save("overlay-0", a, json!({"past": [1], "future": [2]}))
            .unwrap();
        s.activate("overlay-0", "left", "b");
        assert!(s.get("overlay-0").unwrap().snapshot.is_none());
        s.activate("overlay-1", "right", "a");
        assert!(s.get("overlay-1").unwrap().snapshot.is_none());
        s.suspend("overlay-0");
        s.activate("overlay-2", "left", "a");
        assert_eq!(
            s.get("overlay-2").unwrap().snapshot.unwrap(),
            json!({"past": [1], "future": [2]})
        );
    }
    #[test]
    fn delayed_saves_cannot_cross_spaces_or_replace_newer_history() {
        let mut s = Sessions::default();
        s.activate("overlay-0", "left", "a");
        let a = s.get("overlay-0").unwrap().generation;
        s.activate("overlay-0", "left", "b");
        s.save("overlay-0", a, json!("late a")).unwrap();
        assert!(s.get("overlay-0").unwrap().snapshot.is_none());
        assert!(s.save("overlay-1", a, json!("wrong owner")).is_err());
        assert!(s.save("overlay-0", 999, json!("unknown")).is_err());
        s.activate("overlay-0", "left", "a");
        let newer = s.get("overlay-0").unwrap().generation;
        s.save("overlay-0", newer, json!("new a")).unwrap();
        s.save("overlay-0", a, json!("stale a")).unwrap();
        assert_eq!(
            s.get("overlay-0").unwrap().snapshot.unwrap(),
            json!("new a")
        );
    }
    #[test]
    fn only_the_current_generation_can_enable_an_overlay() {
        let mut s = Sessions::default();
        assert!(s.activate("overlay-0", "left", "a"));
        let a = s.get("overlay-0").unwrap().generation;
        assert!(!s.is_ready("overlay-0"));
        assert!(s.mark_ready("overlay-0", a));
        assert!(!s.activate("overlay-0", "left", "a"));
        s.activate("overlay-0", "left", "b");
        assert!(!s.mark_ready("overlay-0", a));
        assert!(!s.is_ready("overlay-0"));
        s.suspend("overlay-0");
        assert!(s.get("overlay-0").is_err());
        assert!(!s.mark_ready("overlay-0", a));
    }
}
