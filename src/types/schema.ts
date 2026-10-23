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
  | 'quantity'
  | 'workloadRef'
  | 'heading'

/** Physical dimension of a 'quantity' question; selects its unit list and base unit. */
export type QuantityDimension = 'time' | 'size'

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
  conditionalOn?: Condition
  /**
   * For 'quantity': the dimension (time → base hours; size → base GB).
   * 'duration' is treated as a time quantity.
   */
  dimension?: QuantityDimension
  /** For 'number': only whole numbers are valid. */
  integer?: boolean
  /**
   * For 'number' / 'quantity' / 'duration': show a "Don't know" tick-box
   * beside the input. When ticked the stored value is "dont_know" — never
   * 0 or blank, so it is not mistaken for a measurement.
   */
  allowUnknown?: boolean
  /** For 'repeatable': maximum number of entries (the Add button hides at the cap). */
  maxEntries?: number
  /**
   * For 'workloadRef': options are taken from the rows of another
   * (top-level) repeatable question — e.g. the code names entered in the
   * workload table — so follow-up sections refer to a workload instead of
   * re-entering it. The stored value is the selected row's label.
   */
  optionsFrom?: { questionId: string; labelField: string }
  /**
   * For 'select': options generated from the cluster config, placed before
   * any static `options`. 'queues' lists every cluster queue with its limits
   * (value "<cluster>.<queue>", e.g. "gargi.medium").
   */
  configOptions?: 'queues'
  /**
   * Which committee computation or test this answer feeds (free-form tags,
   * e.g. "core_hours_per_year", "long_walltime_test"). Documentation for the
   * analysis layer; a question with no use should not exist.
   */
  committeeUse?: string[]
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
   * TODO (future harmonisation): wall-time fields in Section E and other
   * time-valued fields currently use a plain number (hours). When those
   * sections are revised, adopt this same duration type throughout so that
   * the Apps Script can normalise all time fields to a single unit (hours)
   * consistently.
   */
  units?: string[]
  /** Default unit shown when the question is first rendered. */
  defaultUnit?: string
  /**
   * For 'repeatable' type: the singular noun used in the Add button.
   * e.g. "code" → "+ Add code" / "+ Add another code"
   * Defaults to "entry" if omitted.
   */
  entryLabel?: string
  /**
   * Minimum value for number inputs (inclusive).
   */
  min?: number
  /**
   * Maximum value for number inputs (inclusive).
   */
  max?: number
  /**
   * When true and this question is a subQuestion of a repeatable group,
   * it is rendered collapsed behind a "show more" disclosure within each
   * row instead of appearing by default. Used to de-emphasise secondary
   * fields (e.g. storage, interconnect sensitivity) without removing them
   * from the schema or hiding them entirely.
   */
  advanced?: boolean
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
   * condition(s) are satisfied.
   *
   * Single condition: section shown when the referenced question's current
   * value is one of the listed values.
   *
   * Array of conditions (OR logic): section shown when ANY condition is met.
   * Each condition is independently evaluated; the section appears if at
   * least one condition evaluates to true.
   *
   * Used to hide GPU, long-wall-time, or other specialist sections
   * until triggered by earlier answers.
   */
  conditionalOn?: Condition | Condition[]
  /**
   * When the condition(s) are satisfied (same OR semantics as conditionalOn),
   * the section stays visible but opens collapsed behind a notice saying it
   * is optional; the respondent can expand it to add details. Used e.g. to
   * make job-setup and runtime detail skippable for groups reporting no
   * operational problems, without discarding the option to provide it.
   */
  optionalWhen?: Condition | Condition[]
  /**
   * Top-level "I am not aware / don't know how to characterise this"
   * declaration, rendered as a checkbox above the section's questions.
   * When ticked (stored as `true` under questionId), the rest of the section
   * is hidden and its answers are omitted from the submission. This is a
   * valid answer, never a negative finding — the committee may follow up.
   */
  notAwareOption?: {
    questionId: string
    label: string
    helpText?: string
  }
  questions: Question[]
}

/**
 * Visibility / trigger predicate.
 * - ValueCondition: the answer (string or string[]) includes one of `values`.
 * - RowsCondition: at least one row of a repeatable satisfies `where`.
 * - { all } / { any } / { not }: compound conditions.
 * Arrays of conditions in conditionalOn / optionalWhen keep their OR meaning.
 */
export type Condition =
  | ValueCondition
  | RowsCondition
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }

export interface ValueCondition {
  questionId: string
  values: string[]
}

export interface RowsCondition {
  /** ID of the repeatable question whose rows are tested. */
  rowsOf: string
  where: RowPredicate
}

/**
 * Predicate on one row. Numeric comparisons convert quantities to base
 * units (hours / GB) and compare against `value` or a cluster-config
 * threshold (`configRef`, e.g. "thresholds.maxCoresPerJob"). Unknown or
 * blank answers, and unset thresholds, never satisfy a comparison.
 */
export type RowPredicate =
  /** `field` may list several fields: their base values are multiplied (e.g. scratch per job × concurrent jobs). */
  | { field: string | string[]; op: 'gt' | 'gte' | 'lt' | 'lte'; value?: number; configRef?: string }
  | { field: string; op: 'in'; values: string[] }
  | { all: RowPredicate[] }
  | { any: RowPredicate[] }

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
