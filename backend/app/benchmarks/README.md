# StoryWeave Benchmarks

This directory stores benchmark datasets and regression reports for StoryWeave continuation experiments.

## Layout

```text
backend/app/benchmarks/
  README.md
  datasets/
    continuation/
      sample.v1.json
  reports/
    .gitkeep
```

## Notes

- `datasets/continuation/` keeps curated continuation benchmark samples.
- `reports/` is reserved for replay outputs and regression summaries.
- The first version is intentionally lightweight: stable sample format first, replay tooling second.

See [plans/benchmark-design.md](../../../plans/benchmark-design.md) for the full design.

## Current tooling

You can validate the sample dataset and generate a replay-plan stub with:

```bash
python scripts/benchmark_replay.py
```

Or validate only:

```bash
python scripts/benchmark_replay.py --no-write
```

To execute real runs against existing database-backed projects, add `live_request`
to the sample and then run:

```bash
python scripts/benchmark_replay.py --execute-live --sample-id <benchmark-id>
```

Samples without `live_request` are skipped in live mode.

For container-backed live runs with real database data, rebuild the backend image
and run the in-container runner:

```bash
docker compose up --build backend -d
docker exec storyweave-backend python -m app.benchmarks.live_replay_runner --variant baseline --variant pipeline
```
