import { checkPasswordStrength, STRENGTH_CONFIG, PASSWORD_RULES } from "./passwordStrength";

// Shows password strength bars, label, and rule checklist
// Usage: <PasswordStrengthIndicator password={password} />
export default function PasswordStrengthIndicator({ password }) {
  // Don't show anything if the user hasn't typed yet
  if (!password) return null;

  const { level, passed, failed } = checkPasswordStrength(password);
  const config = STRENGTH_CONFIG[level];

  return (
    <div className="strength-wrapper">

      {/* Three bars — filled based on strength level */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="strength-bars">
          {[1, 2, 3].map(bar => (
            <div
              key={bar}
              className="strength-bar"
              style={{
                background: bar <= config.bars ? config.color : "#e5e7eb",
              }}
            />
          ))}
        </div>

        {/* Strength label */}
        <span
          className="strength-label"
          style={{ background: config.bg, color: config.color }}
        >
          {level === "weak"   && "⚠ "}
          {level === "medium" && "~ "}
          {level === "strong" && "✓ "}
          {config.label}
        </span>
      </div>

      {/* Rule checklist */}
      <div className="strength-rules">
        {PASSWORD_RULES.map(rule => {
          const isPassed = passed.includes(rule.id);
          return (
            <div
              key={rule.id}
              className={`strength-rule ${isPassed ? "passed" : "failed"}`}
            >
              <span className="rule-icon">{isPassed ? "✓" : "○"}</span>
              <span>{rule.label}</span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
