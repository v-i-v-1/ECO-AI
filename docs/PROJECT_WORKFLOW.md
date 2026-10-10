# EcoBuild AI project workflow

## Product goal

EcoBuild AI is a city-planning simulator. A user edits a virtual city, sees estimated impacts, compares a proposed change, and decides what to do next.

The main workflow is:

1. Choose a city or create a planning scenario.
2. Add, move, resize, rotate, or remove city objects.
3. Calculate city indicators using documented units and source data.
4. Show data quality, assumptions, and uncertainty with each result.
5. Review recommendations and their reasons.
6. Compare a proposed scenario with the current city.
7. Save, revisit, and export the scenario.

## Implementation phases

### Phase 1: Make the current prototype trustworthy

- Keep the 3D editor, environmental dashboard, what-if simulation, and historical BDG2 forecast.
- State clearly which results come from formulas, rules, historical data, or a trained model.
- Define units and time periods for every metric.
- Track renewable demand, generation, grid imports, and avoided emissions separately.
- Give every data source a name, version, year, geographic scope, license, and missing-data policy.
- Remove unused and commented-out code when each module is refactored. Keep new modules small and use clear names.

### Phase 2: Organize data and provenance

- Keep source downloads in `data/raw/` and never edit them in place.
- Store cleaned and spatially matched features in `data/processed/`.
- Record dataset details and transformations in `data/metadata/`.
- Match each source to a building or city cell using documented coordinates, time, units, and spatial resolution.
- Reject unsafe joins, duplicates, invalid units, and features that would leak future information into a training row.

### Phase 3: Validate the simulation

- Define an explicit unit and time basis for energy, emissions, water, waste, land, and green space.
- Validate each calculation against known examples and published references.
- Distinguish measured values, source observations, estimates, assumptions, and model predictions in the interface.
- Show uncertainty or a clear unavailable state when data coverage is weak.
- Keep the custom sustainability score separate from official SDG indicators or ratings.

### Phase 4: Build the energy ML workflow

- Use BDG2 meter readings as the energy target, with weather and building context as candidate features.
- Add geospatial features only where a building coordinate can be matched to a source grid responsibly.
- Freeze a time-based train/validation/test split before feature experiments.
- Compare against simple baselines and report MAE, RMSE, RMSLE, and per-building coverage.
- Save model version, feature list, training data version, metrics, and limitations beside the model.
- Keep the current historical forecast endpoint labelled as retrospective. Do not call it a live forecast.

### Phase 5: Complete backend and project storage

- Keep calculation, validation, model inference, recommendation, and scenario services separate.
- Add persistent project and scenario storage only after the data model is stable.
- Save source provenance and scenario revisions so a result can be reproduced.
- Add authentication only if the application is deployed for multiple users.

### Phase 6: Add the SDG dashboard

- Show all 17 goals in one catalog.
- For each goal, list its city-relevant indicators, direction of improvement, data sources, coverage, and limitations.
- Mark a goal as `available`, `partial`, or `not available` based on actual data coverage.
- Do not infer social outcomes such as poverty, health, education, gender equality, or decent work from building energy alone.
- Let users inspect the indicators contributing to each goal instead of using one opaque SDG score.

### Phase 7: Verify and deliver

- Verify the frontend and backend launch from a clean start.
- Check API health, building lookup, forecast response, scenario comparison, and saved scenario recovery.
- Check calculations and data joins against representative cases.
- Review small screens, keyboard interaction, readable labels, and error states.
- Document setup, training, data downloads, licenses, and limitations in the project README.

## SDG coverage plan

All goals are represented in the product plan. This does not mean the current prototype has enough data to calculate every goal.

| SDG | City-planning view | Example indicators and data needed | Current status |
| --- | --- | --- | --- |
| 1. No Poverty | Access to affordable, resilient housing and essential services | Housing affordability, service access, local household data | Not available; requires local socioeconomic data |
| 2. Zero Hunger | Access to food and resilient urban food systems | Food access, urban agriculture, food-system data | Not available; requires local food and access data |
| 3. Good Health and Well-being | Exposure and access to healthy environments and services | Air quality, heat exposure, green access, health-service access | Partial; city data and validation needed |
| 4. Quality Education | Access to schools and safe routes | School locations, population by age, travel access | Not available; requires education and population data |
| 5. Gender Equality | Safe and equitable access to city services | Disaggregated access and safety data | Not available; requires responsible local data |
| 6. Clean Water and Sanitation | Water demand, supply resilience, reuse, sanitation access | Water use and service coverage | Partial; current values are assumptions, not local measurements |
| 7. Affordable and Clean Energy | Demand, renewable generation, and energy access | Meter data, weather, renewable output, grid factors | Partial; BDG2 supports historical energy experiments |
| 8. Decent Work and Economic Growth | Access to jobs and resilient local economic activity | Employment access and local economic data | Not available; requires local socioeconomic data |
| 9. Industry, Innovation and Infrastructure | Resilient infrastructure and clean technology | Infrastructure access, energy reliability, asset condition | Partial; infrastructure is visualized, service data is missing |
| 10. Reduced Inequalities | Fair access to housing, transport, and services | Access indicators disaggregated by population groups | Not available; requires appropriate demographic data |
| 11. Sustainable Cities and Communities | Housing, transport, resilience, public space, and land use | Buildings, roads, hazards, access, land use, green space | Partial; city editor and geospatial source files exist |
| 12. Responsible Consumption and Production | Energy, water, materials, and waste efficiency | Meter, water, material, reuse, and waste-flow data | Partial; energy is modeled, other flows need validation |
| 13. Climate Action | Operational emissions, climate hazards, adaptation | Energy, grid emissions, weather, hazards, exposure | Partial; energy-related emissions are estimates |
| 14. Life Below Water | Urban effects on rivers, coasts, and aquatic systems | Watersheds, discharge, water quality, coastal exposure | Not available; requires hydrology and water-quality data |
| 15. Life on Land | Habitat, land cover, trees, and biodiversity | WorldCover, habitat, vegetation, protected areas | Partial; WorldCover files are downloaded, not yet joined |
| 16. Peace, Justice and Strong Institutions | Transparent planning and equitable public participation | Participation, service fairness, governance data | Not available; requires governance and engagement data |
| 17. Partnerships for the Goals | Source transparency and interoperable collaboration | Dataset provenance, licenses, partner and project records | Partial; provenance conventions and documentation are pending |

## Current project status

- The React and Three.js city editor, environmental calculations, recommendations, and what-if tools are present.
- A FastAPI endpoint serves a trained LightGBM model for historical held-out BDG2 meter forecasts.
- The BDG2 training artifacts are present. This model is not a live forecast and is not the source for all dashboard indicators.
- WorldCover and Copernicus DEM site tiles are downloaded but are not joined to training data.
- OpenStreetMap country extracts are present, but they are broad source files, not processed features.
- WorldPop downloads are incomplete and must not be treated as ready-to-use data.
- ERA5 has not been downloaded or integrated.
- The 17-goal coverage catalog is in the UI; goal-specific validated indicators and data are still pending.
- Persistent scenario storage, full data provenance, and validated environmental units remain to be implemented.

## Code style

- Prefer short modules with one clear responsibility.
- Use names that explain the value or action without requiring a comment.
- Keep functions small and pass dependencies as arguments where practical.
- Do not leave commented-out code in refactored modules.
- Keep assumptions, units, data sources, and model limitations in user-facing documentation and metadata.
- Do not label formula estimates or rule-based suggestions as ML predictions.
