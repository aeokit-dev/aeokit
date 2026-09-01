# Agent optimization workflow

AEOkit gives agents a durable feedback loop instead of treating each audit as an isolated report:

```text
audit -> observe baseline -> improve -> record experiment -> observe again -> evaluate
```

## 1. Audit and establish the corpus

Use an AEOkit audit skill to diagnose crawlability, entity clarity, evidence support, and answer readiness. Review its buyer questions before creating the stable prompt corpus. An audit is read-only; it does not prove visibility.

```sh
aeokit audit PROJECT_ID
```

## 2. Observe the baseline

Run the approved corpus only after choosing providers, samples, and a cost ceiling. The explicit flag prevents an agent or operator from accidentally starting paid provider work.

```sh
aeokit observe PROJECT_ID --confirm-cost
```

Preserve the resulting run IDs, prompt corpus, providers, surfaces, locale, and observation timestamps. Those dimensions define which later observations are comparable.

## 3. Record and implement one experiment

Choose one evidence-backed opportunity and create a falsifiable experiment before changing the site:

```sh
aeokit experiment create PROJECT_ID --data '{
  "name": "Improve comparison evidence",
  "hypothesis": "Adding a sourced comparison increases citation rate for the tracked evaluation prompts.",
  "changedUrls": ["https://example.com/compare"],
  "changeRef": "https://github.com/example/site/pull/123",
  "baselineRunIds": ["RUN_ID"],
  "baselineMetrics": {"citationRate": 0.2},
  "evaluationDueAt": "2026-10-01T00:00:00.000Z"
}'
```

The same workflow is available in the bundled UI at `/app/projects/<project-id>/experiments`. Record the deployed URL or commit reference, not merely a local filename.

## 4. Re-observe independently

After the evaluation window, run the unchanged corpus in a fresh observation context. Do not give the observer the optimization agent's desired result. Attach only compatible follow-up run IDs.

## 5. Evaluate without overstating causality

Record result metrics and classify the outcome as `won`, `lost`, `inconclusive`, or still `evaluating`:

```sh
aeokit experiment evaluate EXPERIMENT_ID --data '{
  "status": "inconclusive",
  "followupRunIds": ["FOLLOWUP_RUN_ID"],
  "resultMetrics": {"citationRate": 0.3}
}'
```

A before-and-after difference alone does not prove causality. Preserve concurrent changes, provider or model changes, failures, and insufficient samples in the evaluation. Recommend the next opportunity only after recording the current outcome.
