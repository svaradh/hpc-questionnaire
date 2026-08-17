/**
 * App — root component for the HPC Workload Characterisation Questionnaire.
 *
 * Loads the questionnaire schema from the JSON file and wires together
 * the form state hook with the FormShell component.
 */

import { FormShell } from './components/FormShell'
import { useFormState } from './hooks/useFormState'
import type { QuestionnaireSchema } from './types/schema'
import schemaData from './schema/questionnaire_v1.json'
import './App.css'

// Cast the imported JSON to our TypeScript type.
// The JSON structure is validated by the TypeScript compiler via resolveJsonModule.
const schema = schemaData as unknown as QuestionnaireSchema

export function App() {
  const { answers, setAnswer, clearAll, lastSaved } = useFormState()

  return (
    <FormShell
      schema={schema}
      answers={answers}
      onAnswer={setAnswer}
      onClearAll={clearAll}
      lastSaved={lastSaved}
    />
  )
}
