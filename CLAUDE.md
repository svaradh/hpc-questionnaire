# HPC Workload Characterisation & QoS Questionnaire

## Project objective

Build a web-based questionnaire/form for users of an institutional HPC facility.

The purpose is to collect factual, reproducible information about research workloads so that an HPC Users' Committee can design and assign appropriate Quality-of-Service (QoS) classes.

The questionnaire must NOT ask users to determine their own entitlement, priority, queue, or whether their research "requires" a particular service. Users provide information and evidence; the committee interprets the information using transparent tests and agreed policy.

The system must be designed for approximately 50–60+ research groups and therefore minimise respondent and committee workload.

The design should be modular and extensible. I will provide additional specifications and changes during development. Do not hard-code assumptions that prevent later changes to questions, sections, branching, scoring, or evidence requirements.

---

# 1. Core philosophy

The questionnaire must embody these principles:

### 1.1 Collect evidence, don't ask users to make judgements

Avoid questions such as:

- "Do you require a long-wall-time queue?"
- "Is your research computational?"
- "What priority do you deserve?"
- "What is the minimum service you require?"
- "Is HPC essential to your research?"

Such questions invite subjective interpretation and bias.

Instead ask for observable information:

- What software is used?
- What resources are used?
- What runtimes are observed?
- How many jobs are run?
- What happens when jobs hit a wall-time limit?
- Does the software support checkpoint/restart?
- What happens when resources are increased?
- What evidence exists from previous or external HPC systems?
- What workload characteristics are actually observed?

The committee should infer the service requirement.

### 1.2 Do not classify users by disciplinary identity

Do not create categories such as:

- core user
- peripheral user
- theorist
- experimentalist
- computational group
- non-computational group

The questionnaire is about workload characteristics and service requirements.

A separate institutional process may determine eligibility for annual institutional computational entitlements. That process should not be conflated with the QoS workload questionnaire.

### 1.3 Equal access does not imply identical service

The questionnaire should support a policy in which all legitimate users can access the facility, while different workloads may require different QoS characteristics.

Potential QoS dimensions include:

- normal fixed wall time
- short turnaround
- high throughput
- long uninterrupted wall time
- large node count
- high memory
- GPU/specialised hardware

These should be represented as service characteristics rather than user identities.

### 1.4 Research demand and service requirement are distinct

The questionnaire must help distinguish:

1. Computational demand — how much computation is required.
2. Workload characteristics — how that computation is structured.
3. Service requirement — what scheduling/resource characteristics are technically necessary.
4. Institutional support — a separate policy question concerning which research capabilities the institute chooses to sustain.

Do not infer one automatically from another.

For example:

"High CPU-hour consumption" must NOT automatically imply "long wall-time requirement."

Likewise:

"Computationally important research" must NOT automatically imply "long-wall-time queue."

### 1.5 Neutral and constructive framing

The questionnaire must be presented as a constructive workload-characterisation exercise to help the institute understand the diversity of computational workloads and design appropriate services for all users.

It must not appear to be:
- a test of whether someone deserves HPC access;
- an adversarial challenge to users' claims;
- a mechanism for ranking research importance or identifying privileged groups;
- a disguised core/peripheral or computational/non-computational classification exercise.

The form should communicate:

> "Help us understand your workload so that appropriate services can be designed."

It should not communicate:

> "Prove that you deserve this service."

Even questions intended to establish evidence for unusual requirements must be neutrally and helpfully worded.

### 1.6 Do not ask users to judge scientific importance

Everyone's research is important to them, and faster turnaround benefits all users.

Do not include questions that invite subjective assessments such as:
- "How important is this computation to your research?"
- "How essential is HPC to your research programme?"
- "How critical is a long queue to your work?"

Instead collect operational evidence from which the committee can draw inferences.

---

# 2. Evidence sources

Do NOT assume that current-cluster usage is the authoritative measure of need.

Many legitimate users may have:

- little or no usage on the current cluster;
- been constrained by previous policies;
- used earlier IISER clusters whose records are no longer available;
- used national HPC facilities;
- used collaborators' clusters;
- used cloud resources;
- used other institutional facilities.

The questionnaire must therefore allow evidence from multiple sources.

Possible evidence sources:

- Current IISER HPC records
- Historical IISER HPC records
- External HPC/national facility records
- Previous production calculations
- Collaborator/institutional HPC records
- Standardised benchmark
- Published/software benchmark
- Developer/vendor documentation
- Projected workload
- Other

The form must explicitly state:

"Lack of current-cluster usage is not, by itself, evidence of lack of computational requirement."

Do not turn absence of records into evidence of absence of need. Where exact data cannot be provided, allow approximate historical information, representative examples, benchmark evidence, external evidence, or explicitly marked estimates. "Data unavailable" is a valid response and must not be treated as a negative finding.

---

# 3. Evidence confidence

The system should capture the source of evidence and, where useful, classify evidence by confidence.

Suggested levels:

### Level 1 — Direct production observation
Actual production jobs with documented resource use and runtime.

### Level 2 — Reproducible benchmark
A representative calculation benchmarked on known hardware.

### Level 3 — Historical/external production evidence
Actual production experience on another HPC system with documented configuration.

### Level 4 — Software/scaling evidence
Published, developer, or vendor information supporting the estimate.

### Level 5 — Projection
Estimated future workload without direct supporting measurements.

Do not use these levels to automatically rank users.

They indicate confidence in the evidence supplied.

---

# 4. Respondent model

The form may be completed by:

- PI
- postdoctoral researcher
- PhD student
- designated computational group member
- technical staff

A PI should be able to nominate another group member to complete the technical sections.

The form should explicitly recognise that the person running the calculations may know substantially more about the workload than the PI.

The PI should nevertheless be able to review/confirm the final submission.

---

# 5. "Don't know" is a valid answer

For technical questions, provide appropriate choices such as:

- Yes
- No
- Don't know
- Not applicable
- Not tested
- Information unavailable

Do NOT interpret "Don't know" as "No."

Do NOT penalise incomplete technical knowledge.

If important information is missing, flag it for possible clarification or technical assistance.

The system should distinguish where useful between:

- Don't know
- Not tested
- Data unavailable
- Not applicable

---

# 6. Micro-question design

The questionnaire should use simple questions with checkboxes/radio buttons wherever possible.

Technical questions should have short examples/help text.

Examples should help respondents recognise the appropriate answer rather than teach HPC theory.

Examples should not be framed as warnings, challenges, or attempts to catch incorrect answers.

Example:

"Does the application support checkpoint/restart?"

[ ] Yes
[ ] No
[ ] Don't know
[ ] Not applicable

Help:
"If a job can be stopped and later resumed without repeating completed computation, this is an example of restartable execution."

Another example:

"Can the workload be divided into independent jobs?"

[ ] Yes
[ ] No
[ ] Partly
[ ] Don't know

Help:
"For example, running 100 independent calculations as 100 separate jobs is a highly parallel/decomposable workload."

---

# 7. Workload questionnaire structure

The initial questionnaire should be modular.

Proposed sections:

## A. Research programme

Collect only basic contextual information.

Do NOT ask users to classify their research as computational, experimental, theory, etc.

Suggested fields:

- Research group
- Department
- PI
- Person completing form
- Brief description of research activities for which HPC resources are used/requested

## B. Workload profile

Identify:

- principal applications/codes
- type of computational workload
- number of production jobs
- approximate job distribution
- typical resource configurations

Potential workload categories:

- electronic structure
- molecular dynamics
- atomistic simulation
- climate/environmental modelling
- CFD
- bioinformatics/genomics
- machine learning
- numerical modelling
- many-body/exact diagonalisation
- data analysis
- other

## C. Resource configuration

Collect factual information about:

- nodes
- CPU cores
- GPUs
- memory per node
- storage
- interconnect/specialised resources where relevant

## D. Runtime and wall-time behaviour

Be very precise about terminology.

Wall time means elapsed time while the job is actually running, excluding queue waiting time.

However, runtime depends on resource allocation.

Therefore DO NOT ask simply:

"What wall time does your job require?"

Instead collect paired data such as:

| Workload | Resources | Wall time | CPU/GPU hours | Number of similar jobs |
|---|---|---|---|---|

Where available, allow multiple configurations for the same workload.

The committee should infer whether wall time is intrinsic or affected by resource allocation.

## E. Wall-time termination

Ask factual questions:

- Has a job been terminated because of a wall-time limit?
- How often?
- What was the requested wall time?
- How long had it actually run?
- Was it restarted?
- How much work was lost?
- Did the job eventually complete?
- Was the same workload successfully completed under another configuration?

Do not ask whether the user "needs" a longer wall time.

## F. Checkpoint/restart

Collect:

- whether supported
- native or external
- checkpoint interval
- restart behaviour
- computational loss after interruption
- whether tested
- whether currently used

If unknown, allow "Don't know."

Do not ask whether checkpoint/restart "solves" the user's wall-time problem. The committee infers the significance.

## G. Parallel scaling

Collect factual observations:

- resource configurations tested
- runtime at each configuration
- scaling behaviour
- whether workload consists of independent jobs
- whether increasing node count changes runtime
- whether there is a practical minimum/maximum node count

Do not ask the user to judge whether their application "requires" a particular node count.

## H. Memory requirements

Collect:

- typical memory
- observed peak memory
- minimum workable memory
- whether memory is per-node or distributed
- whether standard nodes have been tested

## I. GPU/specialised resources

Collect:

- whether GPU is used
- which GPU/software
- performance with/without GPU where available
- specialised interconnect requirements
- minimum/typical resource configuration

## J. Throughput

Collect:

- number of independent jobs
- concurrent jobs
- total CPU/GPU hours
- typical turnaround
- number of jobs waiting
- whether jobs can be executed independently

Do not ask whether the user "prefers throughput."

## K. Historical/external evidence

Allow users to enter multiple evidence records.

Each record should include:

- source
- code
- workload
- hardware
- resource configuration
- runtime
- CPU/GPU hours
- number of jobs
- optional supporting document/reference

## L. Benchmark evidence

Allow users to provide or request standardised benchmarks.

The facility should eventually maintain a benchmark library for common codes.

The questionnaire should support:

- existing benchmark
- user-provided benchmark
- benchmark requested
- benchmark unavailable

## M. Workflow/support

Ask factual questions about whether the group has investigated:

- checkpoint/restart
- job decomposition
- job arrays
- workflow managers
- scaling
- memory optimisation
- GPU acceleration

Do not imply that failure to do these things is evidence against the user's requirement.

Where appropriate, allow:

"Would technical assistance be useful?"

## N. Requested/observed service characteristics

Do NOT ask users to select their entitlement.

Instead ask them to describe the operational problem they experience, e.g.:

- jobs terminated by wall-time limit
- excessive queue waiting
- insufficient node count
- insufficient memory
- insufficient GPU access
- insufficient total capacity
- other

The committee will translate this into QoS requirements.

---

# 8. Committee workflow

The system should eventually support a committee-facing view.

The committee should not have to manually inspect every submission in equal depth.

Use triage.

### Category 1 — Automatically characterised

Data are sufficient and workload fits an established QoS profile.

### Category 2 — Clarification

Missing/inconsistent information can be resolved with a short follow-up.

### Category 3 — Technical assessment

Unusual or contested service requirement requiring deeper analysis.

Examples:

- unusually long wall time
- unusually large node count
- very high memory
- specialised hardware
- contradictory evidence
- substantial unmet demand

The system should help identify Category 2 and Category 3 cases.

Category 3 examination must be framed constructively, not adversarially. The neutral principle is:

> Unusual service requirements should be supported by appropriate evidence, just as ordinary service requirements are characterised by evidence.

This is not an attempt to disprove users. It is an attempt to ensure that evidence is proportionate to the service characteristics being considered.

---

# 9. No automatic entitlement scoring

IMPORTANT:

Do not build a numerical "priority score" unless explicitly instructed later.

Do not automatically classify users into privileged or non-privileged categories.

Do not automatically assign queues based solely on questionnaire responses.

The initial system is an evidence collection and workload-characterisation tool.

Policy interpretation and QoS assignment will be specified later.

---

# 10. Data model

Design the application so that:

- questions are modular;
- sections can be reordered;
- questions can be added/removed without rewriting application logic;
- answer options can be changed through configuration;
- conditional branching can be added later;
- evidence records can be repeated;
- questionnaire versions can be tracked;
- submissions can be exported as CSV/JSON;
- committee summaries can be generated later.

Use a clean internal data model separating:

1. Respondent/group information
2. Workload records
3. Resource records
4. Runtime records
5. Evidence records
6. Checkpoint/restart information
7. Scaling information
8. QoS/service observations
9. Committee assessment

---

# 11. User experience

The form should be:

- concise
- non-threatening
- technically precise
- easy for students to complete
- usable by researchers with limited HPC expertise
- accessible on desktop and tablet
- clear about optional vs required information

The questionnaire should have a small mandatory core and detailed optional sections. Do not require respondents to provide technical information that is irrelevant to their workload. The goal is simple completion for ordinary users, with detailed evidence sections available for unusual or contested requirements.

Use progressive disclosure where appropriate.

Do not show highly technical sections unless relevant.

For example, a user who does not use GPUs should not have to navigate a long GPU questionnaire.

Similarly, the long-wall-time module should be activated when relevant workload information indicates that it needs examination.

---

# 12. Important conceptual distinction

The form must preserve this distinction throughout:

### Computational dependence
How important computational infrastructure is to the research programme.

### Computational demand
How much computational resource is consumed or expected.

### Workload characteristics
How the computation is structured.

### QoS requirement
What service characteristics are technically necessary.

### Institutional support
What level of computational infrastructure the institute chooses to guarantee to particular research programmes.

These are separate questions.

The questionnaire primarily addresses the first four through evidence.

It should NOT attempt to determine the fifth.

---

# 13. Development approach

Do not immediately build the entire final application.

Proceed incrementally.

### Phase 1
Create the questionnaire information architecture and data model.

### Phase 2
Implement Sections A–D as a functional prototype.

### Phase 3
Add modular technical sections.

### Phase 4
Add evidence records and upload/reference support.

### Phase 5
Add committee-facing summaries and triage.

### Phase 6
Add export and reporting.

At each stage, keep the application functional.

When I provide additional specifications, modify the architecture rather than creating isolated workarounds.

Before implementing major changes, briefly explain the proposed change and identify any implications for the existing data model or questionnaire logic.

The questionnaire must remain extensible so that additional evidence modules can later be added for specific service characteristics (e.g. long-wall-time, highly parallel, high-memory, GPU, high-throughput workloads). These modules should share the common evidence model rather than becoming unrelated forms.

---

# 14. Current design principle

The most important principle for the entire project is:

> USERS PROVIDE FACTS AND EVIDENCE. THE COMMITTEE APPLIES THE AGREED TESTS.

The form must never turn into a self-declared entitlement application.

The eventual objective is a transparent and technically defensible way of matching workload characteristics to appropriate HPC Quality-of-Service, while ensuring that lack of technical expertise, lack of current-cluster access, or historical policy constraints do not themselves disadvantage a research group.

The underlying message to respondents is:

> We are not asking you to defend your research. We are asking for enough factual information to understand the diversity of workloads and design fair, technically appropriate services for everyone.

Build the project so that this philosophy remains visible in both the implementation and the user interface.
