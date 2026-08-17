/**
 * TypeScript types for the HPC questionnaire JSON schema.
 *
 * Design principles:
 * - Questions are purely data-driven; no logic is embedded in types.
 * - All question types map to Google Forms equivalents where possible.
 * - Repeatable groups are flagged because Google Forms does not support
 *   them natively (see googleFormsNote field).
 * - Conditional branching uses a simple questionId + values predicate
 *   that can be extended to compound predicates later without breaking
 *   the schema shape.
 */

/**
 * Maps to Google Forms question types:
 *   text      → SHORT_ANSWER
 *   textarea  → PARAGRAPH
 *   radio     → MULTIPLE_CHOICE
 *   checkbox  → CHECKBOXES
 *   select    → DROPDOWN
 *   number    → SHORT_ANSWER (numeric validation in GForms)
 *   repeatable → NOT natively supported in Google Forms.
 *                Use a separate linked Google Form or a fixed-row
 *                table approach when exporting to GForms.
 *   info      → Descriptive text / section header in GForms
 */
export type QuestionType =
  | 'text'
  | 'textarea'
  | 'radio'
  | 'checkbox'
  | 'number'
  | 'select'
  | 'repeatable'
  | 'info'
  | 'duration'

/** A single selectable option within a radio, checkbox, or select question. */
export interface QuestionOption {
  /** Machine-readable value stored in the submission. */
  value: string
  /** Human-readable label shown in the UI. */
  label: string
  /**
   * If true, selecting this option should deselect all others
   * (e.g. "None of the above", "Not applicable").
   * Only meaningful for checkbox questions.
   */
  exclusive?: boolean
}

/**
 * A single question within a section.
 * Questions must not ask users to make judgements about their entitlement
 * or priority — they collect observable facts and evidence only.
 */
export interface Question {
  /** Unique question identifier, stable across schema versions. */
  id: string
  type: QuestionType
  /** The question label displayed to the respondent. */
  label: string
  /** Whether the question must be answered before submission. */
  required: boolean
  /**
   * Short help text shown beneath the question label.
   * Must use plain language; may include a concrete example.
   * Should NOT explain HPC theory — it should help the respondent
   * recognise the right answer for their situation.
   */
  helpText?: string
  /** Placeholder text for text/textarea/number inputs. */
  placeholder?: string
  /** Selectable options for radio, checkbox, select types. */
  options?: QuestionOption[]
  /** Physical unit label displayed after a number input (e.g. "hours", "GB"). */
  unit?: string
  /**
   * Simple single-condition predicate for progressive disclosure.
   * The question is shown only when the referenced question's current
   * value is one of the listed values.
   * Compound conditions may be added in a future schema version.
   */
  conditionalOn?: {
    questionId: string
    values: string[]
  }
  /**
   * Sub-questions rendered inside each row of a repeatable group.
   * Only meaningful when type === 'repeatable'.
   */
  subQuestions?: Question[]
  /**
   * Documents a known limitation when exporting this question to
   * Google Forms. The export layer should surface these warnings.
   *
   * GOOGLE FORMS NOTE: Repeatable groups are not natively supported.
   * When exporting to Google Forms, repeatable sections must be
   * implemented as either:
   *   (a) a separate linked Google Form submitted once per record, or
   *   (b) a fixed set of rows (Row 1, Row 2, …) with blank rows ignored.
   * The React prototype uses an "Add another entry" pattern and stores
   * an array of row objects. The schema preserves this intent; the
   * Google Forms export adapter must flatten it.
   */
  googleFormsNote?: string
  /**
   * When true, this field is automatically populated from the corresponding
   * PI fields when the respondent indicates they are the PI (A_pi_is_respondent = 'yes').
   * The field remains visible but is disabled in that state.
   */
  mirrorFromPI?: boolean
  /**
   * For 'duration' type: ordered list of time units the user can select.
   * e.g. ["seconds", "minutes", "hours", "days"]
   * Value stored as { value: number, unit: string }.
   * The Apps Script normalises to hours on write.
   *
   * TODO (future harmonisation): wall-time fields in Section D and other
   * time-valued fields currently use a plain number (hours). When those
   * sections are revised, adopt this same duration type throughout so that
   * the Apps Script can normalise all time fields to a single unit (hours)
   * consistently.
   */
  units?: string[]
  /** Default unit shown when the question is first rendered. */
  defaultUnit?: string
  /**
   * Minimum value for number inputs (inclusive).
   */
  min?: number
  /**
   * Maximum value for number inputs (inclusive).
   */
  max?: number
}

/**
 * A single section of the questionnaire.
 * Sections are independent modules; their order and presence
 * can be changed without altering question logic.
 */
export interface Section {
  /** Unique section identifier (e.g. 'A', 'B', 'section_gpu'). */
  id: string
  /** Short section title displayed in navigation and headings. */
  title: string
  /** Optional descriptive paragraph shown at the top of the section. */
  description?: string
  /**
   * Progressive disclosure: the entire section is hidden unless the
   * referenced question's value is one of the listed values.
   * Used to hide GPU, long-wall-time, or other specialist sections
   * until triggered by earlier answers.
   */
  conditionalOn?: {
    questionId: string
    values: string[]
  }
  questions: Question[]
}

/**
 * Top-level questionnaire schema.
 * The version field allows submissions to record which schema they
 * were completed against, enabling future schema migrations.
 */
export interface QuestionnaireSchema {
  /** Semantic version string, e.g. "1.0.0". */
  version: string
  title: string
  description: string
  /**
   * Core philosophy notice displayed prominently at the top of the form.
   * This text must remain visible to the respondent throughout.
   */
  coreNotice: string
  sections: Section[]
}
